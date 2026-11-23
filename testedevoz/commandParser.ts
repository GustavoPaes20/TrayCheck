import type { ChecklistItem, ParsedCommand, VoiceIntent, Alternative } from "./Types.js";
import { normalize, similarity, parseQuantityToken } from "./Text.ts";

// Vocabulário deliberadamente curto: em centro cirúrgico, falso positivo (confirmar/pular sem querer) é pior que pedir para repetir.
const COMMANDS = {
  skip: ["pular", "pula", "pule"],
  repeat: ["repetir", "repete", "repita"],
  finish: ["finalizar", "finalizar checagem", "finaliza"],
  start: ["iniciar", "iniciar checagem"],
  confirmCurrent: ["confirmar", "confirma"],
} as const;

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "com", "a", "o", "e"]);
const FILLERS = new Set(["quantidade", "quantidades", "unidade", "unidades", "encontrado", "encontrados", "encontrei", "tem", "temos", "item", "por", "favor"]);

export const MIN_ITEM_SCORE = 0.75; // abaixo disso não confirma nada (UC06-A1)
export const AMBIGUITY_MARGIN = 0.08; // dois itens a menos que isso um do outro = ambíguo

const tokens = (s: string) => normalize(s).split(" ").filter(Boolean);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const bestSim = (t: string, pool: string[]) => Math.max(0, ...pool.map((p) => similarity(t, p)));

function scoreName(phrase: string[], name: string[]): number {
  if (!phrase.length || !name.length) return 0;
  const phraseCov = mean(phrase.map((t) => bestSim(t, name))); // o que foi dito é explicado pelo nome?
  const nameCov = mean(name.map((t) => bestSim(t, phrase))); // o nome inteiro foi dito?
  return phraseCov * (0.7 + 0.3 * nameCov);
}

function scoreItem(phrase: string[], item: ChecklistItem): number {
  const names = [item.name, ...(item.aliases ?? [])];
  return Math.max(...names.map((n) => scoreName(phrase, tokens(n).filter((t) => !STOPWORDS.has(t)))));
}

type ItemMatch = { kind: "match"; item: ChecklistItem; quantity?: number | undefined } | { kind: "ambiguous"; ids: string[] } | { kind: "none" };

function matchItem(norm: string, items: ChecklistItem[]): ItemMatch {
  const open = items.filter((i) => i.status === "pendente" || i.status === "pulado"); // UC06 passo 2
  const all = norm.split(" ").filter((t) => t && !STOPWORDS.has(t) && !FILLERS.has(t));
  if (!all.length || !open.length) return { kind: "none" };

  // Interpretações: frase inteira, ou frase sem a quantidade final ("Kelly três"). Nomes com número ("Fio 2") ficam cobertos pela primeira.
  const readings: { phrase: string[]; quantity?: number | undefined }[] = [{ phrase: all }];
  const last = all[all.length - 1] ?? "";
  const q = parseQuantityToken(last);
  if (q !== undefined && all.length > 1) readings.unshift({ phrase: all.slice(0, -1), quantity: q });

  type Scored = { item: ChecklistItem; score: number };
  let bestReading: { scored: Scored[]; quantity: number | undefined } | undefined;
  let bestTop = 0;
  for (const r of readings) {
    const scored: Scored[] = open.map((item) => ({ item, score: scoreItem(r.phrase, item) })).sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (top && top.score > bestTop) {
      bestTop = top.score;
      bestReading = { scored, quantity: r.quantity };
    }
  }
  const winner = bestReading?.scored[0];
  if (!bestReading || !winner || bestTop < MIN_ITEM_SCORE) return { kind: "none" };

  const close = bestReading.scored.filter((s) => bestTop - s.score < AMBIGUITY_MARGIN && s.score >= MIN_ITEM_SCORE);
  if (close.length > 1) return { kind: "ambiguous", ids: close.map((c) => c.item.id) };
  return { kind: "match", item: winner.item, quantity: bestReading.quantity };
}

function matchCommand(norm: string, fuzzy: boolean): VoiceIntent | undefined {
  // "confirmar três" / "confirmar 3": confirma o item atual com quantidade
  const parts = norm.split(" ");
  if (parts.length === 2 && COMMANDS.confirmCurrent.some((c) => c === parts[0])) {
    const q = parseQuantityToken(parts[1] ?? "");
    if (q !== undefined) return { type: "confirmCurrent", quantity: q };
  }
  const map: [keyof typeof COMMANDS, VoiceIntent][] = [
    ["skip", { type: "skip" }], ["repeat", { type: "repeat" }], ["finish", { type: "finish" }],
    ["start", { type: "start" }], ["confirmCurrent", { type: "confirmCurrent" }],
  ];
  for (const [key, intent] of map) {
    for (const word of COMMANDS[key]) {
      if (norm === word) return intent;
      if (fuzzy && !word.includes(" ") && !norm.includes(" ") && similarity(norm, word) >= 0.82) return intent; // "finalisar"
    }
  }
  return undefined;
}

export function parseTranscript(transcript: string, items: ChecklistItem[]): VoiceIntent {
  const norm = normalize(transcript);
  if (!norm) return { type: "unrecognized" };
  const exact = matchCommand(norm, false);
  if (exact) return exact;
  const m = matchItem(norm, items);
  if (m.kind === "match") return { type: "confirm", itemId: m.item.id, quantity: m.quantity };
  if (m.kind === "ambiguous") return { type: "ambiguous", candidateIds: m.ids };
  return matchCommand(norm, true) ?? { type: "unrecognized" };
}

/**
 * Usa as alternativas do reconhecedor (maxAlternatives) para tolerar ruído:
 * devolve a primeira que resulta em comando válido; se nenhuma, prefere "ambígua" a "não reconhecida".
 * O limiar de confiança vale só para a alternativa principal (as demais têm confiança menor por natureza):
 * se a principal está abaixo de minConfidence, o resultado todo é tratado como ruído (0 = navegador não informa, não descarta).
 */
export function parseAlternatives(alts: Alternative[], items: ChecklistItem[], minConfidence = 0.5): ParsedCommand {
  let ambiguous: ParsedCommand | undefined;
  const top = alts[0];
  if (top && top.confidence > 0 && top.confidence < minConfidence) {
    return { intent: { type: "unrecognized" }, transcript: top.transcript, confidence: top.confidence };
  }
  for (const alt of alts) {
    const intent = parseTranscript(alt.transcript, items);
    if (intent.type === "unrecognized") continue;
    const parsed = { intent, transcript: alt.transcript, confidence: alt.confidence };
    if (intent.type === "ambiguous") { ambiguous ??= parsed; continue; }
    return parsed;
  }
  return ambiguous ?? { intent: { type: "unrecognized" }, transcript: alts[0]?.transcript ?? "", confidence: alts[0]?.confidence ?? 0 };
}