import type { Alternative, RecognizerErrorCode, SpeechRecognizer } from "./Types.ts";

// A lib.dom do TypeScript não traz SpeechRecognition; tipos mínimos locais evitam dependência extra.
interface SRAlternative { transcript: string; confidence: number }
interface SRResult { isFinal: boolean; length: number; [i: number]: SRAlternative }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRInstance {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null; onstart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type SRCtor = new () => SRInstance;

const FATAL = new Set<RecognizerErrorCode>(["audio-capture", "not-allowed", "unsupported"]);

export class WebSpeechRecognizer implements SpeechRecognizer {
  onResult: SpeechRecognizer["onResult"] = null;
  onError: SpeechRecognizer["onError"] = null;
  onListeningChange: SpeechRecognizer["onListeningChange"] = null;

  private rec: SRInstance | undefined;
  private wanted = false;
  private restartTimes: number[] = [];
  private readonly Ctor: SRCtor | undefined;
  private readonly lang: string;
  private readonly maxAlternatives: number;

  constructor(lang = "pt-BR", maxAlternatives = 3) {
    this.lang = lang;
    this.maxAlternatives = maxAlternatives;
    const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
    this.Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  }

  get supported() { return !!this.Ctor; }

  start() {
    if (!this.Ctor) { this.onError?.("unsupported"); return; }
    this.wanted = true;
    this.spawn();
  }

  stop() {
    this.wanted = false;
    this.rec?.abort();
  }

  private spawn() {
    if (!this.Ctor || this.rec) return;
    const rec = new this.Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = false; // só resultado final: parcial instável confirmaria item errado
    rec.maxAlternatives = this.maxAlternatives;
    rec.onstart = () => this.onListeningChange?.(true);
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r || !r.isFinal) continue;
        const alts: Alternative[] = [];
        for (let k = 0; k < r.length; k++) {
          const a = r[k];
          if (a) alts.push({ transcript: a.transcript.trim(), confidence: a.confidence });
        }
        this.onResult?.(alts);
      }
    };
    rec.onerror = (e) => {
      const code = this.mapError(e.error);
      if (FATAL.has(code)) this.wanted = false;
      if (code !== "aborted") this.onError?.(code);
    };
    rec.onend = () => {
      this.rec = undefined;
      this.onListeningChange?.(false);
      if (this.wanted) this.scheduleRestart(); // o Chrome encerra sozinho após silêncio/tempo
    };
    this.rec = rec;
    try { rec.start(); } catch { this.rec = undefined; this.onError?.("unknown"); }
  }

  private scheduleRestart() {
    const now = Date.now();
    this.restartTimes = [...this.restartTimes.filter((t) => now - t < 3000), now];
    if (this.restartTimes.length > 5) { // laço de reinício: algo está errado, desiste e deixa o toque assumir
      this.wanted = false;
      this.onError?.("unknown");
      return;
    }
    setTimeout(() => { if (this.wanted) this.spawn(); }, 250);
  }

  private mapError(e: string): RecognizerErrorCode {
    switch (e) {
      case "no-speech": case "audio-capture": case "network": case "aborted": return e;
      case "not-allowed": case "service-not-allowed": return "not-allowed";
      default: return "unknown";
    }
  }
}