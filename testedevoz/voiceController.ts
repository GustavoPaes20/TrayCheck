import { parseAlternatives } from "./commandParser.ts";
import type { Alternative, CheckActions, ChecklistItem, ParsedCommand, RecognizerErrorCode, SpeechRecognizer, Synthesizer } from "./Types.ts";

export type VoiceMode = "voz" | "toque";
export type FallbackReason = RecognizerErrorCode | "repeated-misrecognition" | "unsupported";

export interface VoiceControllerEvents {
  /** Retorno visual imediato (RNF07): texto ouvido e interpretação, antes mesmo da resposta da API. */
  onHeard?(parsed: ParsedCommand): void;
  /** O estado dos itens mudou: o front deve re-renderizar a partir da API (fonte da verdade). */
  onItemsChanged?(): void;
  onModeChange?(mode: VoiceMode, reason?: FallbackReason): void;
  onListeningChange?(listening: boolean): void;
  /** Métrica para RNF07: ms entre o resultado do reconhecimento e o início do retorno sonoro. */
  onLatency?(ms: number): void;
  onStart?(): void;
}

export interface VoiceControllerOptions {
  minConfidence?: number; // padrão 0.5
  maxConsecutiveMisses?: number; // padrão 3 → sugere toque
  networkRetries?: number; // padrão 3
}

const num = (n: number) => String(n);
const describe = (i: ChecklistItem) => `${i.name}, quantidade ${num(i.expectedQty)}`;

export class VoiceController {
  mode: VoiceMode = "voz";
  private misses = 0;
  private netRetries = 0;
  private busy = false;
  private active = false;
  private readonly rec: SpeechRecognizer;
  private readonly tts: Synthesizer;
  private readonly actions: CheckActions;
  private readonly ev: VoiceControllerEvents;
  private readonly opt: VoiceControllerOptions;

  constructor(
    rec: SpeechRecognizer,
    tts: Synthesizer,
    actions: CheckActions,
    ev: VoiceControllerEvents = {},
    opt: VoiceControllerOptions = {},
  ) {
    this.rec = rec;
    this.tts = tts;
    this.actions = actions;
    this.ev = ev;
    this.opt = opt;
    rec.onResult = (alts) => void this.handleResult(alts);
    rec.onError = (code) => this.handleError(code);
    rec.onListeningChange = (l) => ev.onListeningChange?.(l);
  }

  /** RF05 / UC05 passo 4: anuncia o primeiro item e liga o microfone. Sem suporte → segue só por toque (UC05-A2). */
  async begin() {
    this.active = true;
    if (!this.rec.supported) { this.setMode("toque", "unsupported"); }
    const first = this.actions.getCurrentItem();
    if (first) await this.say(`Checagem iniciada. Primeiro item: ${describe(first)}`);
    this.listen();
  }

  end() { this.active = false; this.rec.stop(); this.tts.cancel(); }

  /** Volta para voz depois de um fallback (ex.: o usuário liberou o microfone). */
  retryVoice() { this.misses = 0; this.netRetries = 0; this.setMode("voz"); this.listen(); }

  /** Chamar quando o toque executar uma ação, para o áudio acompanhar (RNF02 + RNF07). */
  async announceAfterTouch(text: string) { await this.say(text); this.listen(); }

  // ---------------------------------------------------------------- internos

  private listen() { if (this.active && this.mode === "voz") this.rec.start(); }

  private setMode(mode: VoiceMode, reason?: FallbackReason) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (mode === "toque") this.rec.stop();
    this.ev.onModeChange?.(mode, reason);
  }

  /** Fala com o microfone fechado: senão o próprio TTS é capturado como comando (eco). */
  private async say(text: string, t0?: number) {
    this.rec.stop();
    if (t0 !== undefined) this.ev.onLatency?.(performance.now() - t0);
    await this.tts.speak(text);
  }

  private async handleResult(alts: Alternative[]) {
    if (this.busy || !this.active) return;
    this.busy = true;
    const t0 = performance.now();
    try {
      const items = this.actions.getItems();
      const parsed = parseAlternatives(alts, items, this.opt.minConfidence ?? 0.5);
      this.ev.onHeard?.(parsed); // feedback visual na hora
      const reply = await this.execute(parsed, items);
      await this.say(reply, t0);
    } catch {
      await this.say("Não consegui registrar. Use o toque na tela.");
    } finally {
      this.busy = false;
      this.listen();
    }
  }

  private async execute(p: ParsedCommand, items: ChecklistItem[]): Promise<string> {
    const i = p.intent;
    if (i.type !== "unrecognized" && i.type !== "ambiguous") this.misses = 0;
    const next = () => {
      const n = this.actions.getCurrentItem();
      return n ? `Próximo: ${describe(n)}` : "Todos os itens tratados. Diga finalizar.";
    };

    switch (i.type) {
      case "confirm":
      case "confirmCurrent": {
        const id = i.type === "confirm" ? i.itemId : this.actions.getCurrentItem()?.id;
        if (!id) return "Não há item para confirmar.";
        const o = await this.actions.confirmItem(id, i.quantity, p.transcript);
        this.ev.onItemsChanged?.();
        if (o.status === "divergente") {
          const kind = o.foundQty < o.expectedQty ? "faltante" : "excedente";
          return `Divergência ${kind}: ${o.itemName}, esperado ${num(o.expectedQty)}, encontrado ${num(o.foundQty)}. ${next()}`;
        }
        return `${o.itemName}, ${num(o.foundQty)}, confirmado. ${next()}`;
      }
      case "skip": {
        const cur = this.actions.getCurrentItem();
        if (!cur) return "Não há item para pular.";
        await this.actions.skipItem(cur.id);
        this.ev.onItemsChanged?.();
        return `Item pulado. ${next()}`;
      }
      case "repeat": {
        const cur = this.actions.getCurrentItem();
        return cur ? describe(cur) : "Não há item pendente.";
      }
      case "finish": {
        const r = await this.actions.finish();
        this.ev.onItemsChanged?.();
        if (r.ok) { this.active = false; return "Checagem finalizada. Relatório gerado."; }
        return `Ainda há ${num(r.pendingCount ?? 0)} itens pendentes.`;
      }
      case "start":
        if (this.actions.start) { await this.actions.start(); this.ev.onStart?.(); return "Checagem iniciada."; }
        return "A checagem já está em andamento.";
      case "ambiguous": {
        const names = i.candidateIds.map((id) => items.find((x) => x.id === id)?.name).filter(Boolean).slice(0, 3).join(", ou ");
        return `Mais de um item parecido: ${names}. Diga o nome completo.`;
      }
      case "unrecognized": {
        this.misses++;
        if (this.misses >= (this.opt.maxConsecutiveMisses ?? 3)) {
          this.misses = 0;
          this.ev.onModeChange?.(this.mode, "repeated-misrecognition"); // só avisa; o toque nunca deixa de estar disponível
          return "Não estou entendendo. Você pode usar os botões na tela.";
        }
        return "Não entendi. Repita, por favor.";
      }
    }
  }

  private handleError(code: RecognizerErrorCode) {
    switch (code) {
      case "no-speech":
      case "aborted":
        return; // silêncio é normal; o reconhecedor reinicia sozinho
      case "network": {
        const max = this.opt.networkRetries ?? 3;
        if (this.netRetries++ < max) {
          setTimeout(() => this.listen(), 1000 * 2 ** (this.netRetries - 1)); // 1s, 2s, 4s
        } else {
          this.setMode("toque", "network");
        }
        return;
      }
      default: // audio-capture, not-allowed, unsupported, unknown
        this.setMode("toque", code);
    }
  }
}