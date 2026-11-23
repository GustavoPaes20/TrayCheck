import { parseAlternatives } from "./commandParser.js";
import type { Alternative, ChecklistItem, VoiceIntent } from "./Types.ts";

/** Uma tentativa do roteiro manual do RNF03: o que o operador DEVIA dizer × o que o reconhecedor devolveu. */
export interface Trial {
  spoken: string; // frase do roteiro
  expected: VoiceIntent;
  heard: Alternative[]; // vazio = nada reconhecido (conta como erro)
}

const same = (a: VoiceIntent, b: VoiceIntent) => JSON.stringify(a) === JSON.stringify(b);

export function evaluate(trials: Trial[], items: ChecklistItem[]) {
  const rows = trials.map((t) => {
    const got = parseAlternatives(t.heard, items).intent;
    return { ...t, got, ok: same(got, t.expected) };
  });
  const hits = rows.filter((r) => r.ok).length;
  const rate = rows.length ? hits / rows.length : 0;
  return {
    total: rows.length,
    hits,
    rate, // RNF03: reconhecidos corretamente ÷ falados
    meetsRNF03: rows.length >= 50 && rate >= 0.8, // roteiro precisa ter no mínimo 50 comandos
    rows,
  };
}

export function toCsv(result: ReturnType<typeof evaluate>): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = result.rows.map((r) => [q(r.spoken), q(r.heard[0]?.transcript ?? ""), r.ok ? "ok" : "erro"].join(","));
  return ["falado,reconhecido,resultado", ...lines].join("\n");
}