import { parseAlternatives, parseTranscript } from "./commandParser.js";
import type { ChecklistItem } from "./Types.js";
import assert from "node:assert/strict";

const it = (id: string, name: string, status: ChecklistItem["status"] = "pendente", expectedQty = 2): ChecklistItem => ({ id, name, expectedQty, status });
const items = [
  it("1", "Pinça Kelly curva"), it("2", "Pinça Kelly reta"), it("3", "Tesoura Metzenbaum"),
  it("4", "Cabo de bisturi"), it("5", "Afastador Farabeuf", "pulado"), it("6", "Compressa", "confirmado"),
];
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok -", name); };

t("comandos exatos", () => {
  assert.deepEqual(parseTranscript("Pular", items), { type: "skip" });i
  assert.deepEqual(parseTranscript("repetir", items), { type: "repeat" });
  assert.deepEqual(parseTranscript("Finalizar checagem", items), { type: "finish" });
});
t("comando com erro de reconhecimento", () => {
  assert.deepEqual(parseTranscript("finalisar", items), { type: "finish" });
});
t("item + quantidade em dígito e por extenso", () => {
  assert.deepEqual(parseTranscript("tesoura metzenbaum 3", items), { type: "confirm", itemId: "3", quantity: 3 });
  assert.deepEqual(parseTranscript("Tesoura Metzenbaum três", items), { type: "confirm", itemId: "3", quantity: 3 });
});
t("sem quantidade = undefined (servidor usa a esperada)", () => {
  assert.deepEqual(parseTranscript("cabo de bisturi", items), { type: "confirm", itemId: "4", quantity: undefined });
});
t("acento e caixa", () => {
  assert.deepEqual(parseTranscript("PINÇA KELLY CURVA dois", items), { type: "confirm", itemId: "1", quantity: 2 });
});
t("ambíguo não confirma nada (UC06-A1)", () => {
  const r = parseTranscript("kelly", items);
  assert.equal(r.type, "ambiguous");
});
t("item pulado pode ser retomado por voz", () => {
  assert.deepEqual(parseTranscript("farabeuf um", items), { type: "confirm", itemId: "5", quantity: 1 });
});
t("item já confirmado não é alvo", () => {
  assert.equal(parseTranscript("compressa", items).type, "unrecognized");
});
t("ruído / fala fora do vocabulário", () => {
  assert.equal(parseTranscript("bom dia pessoal", items).type, "unrecognized");
  assert.equal(parseTranscript("", items).type, "unrecognized");
});
t("usa a 2ª alternativa quando a 1ª é lixo", () => {
  const r = parseAlternatives([{ transcript: "fala pular", confidence: 0.6 }, { transcript: "pular", confidence: 0.4 }], items);
  assert.deepEqual(r.intent, { type: "skip" });
});
t("confiança baixa da principal vira ruído; 0 (desconhecida) não", () => {
  assert.equal(parseAlternatives([{ transcript: "pular", confidence: 0.2 }], items).intent.type, "unrecognized");
  assert.equal(parseAlternatives([{ transcript: "pular", confidence: 0 }], items).intent.type, "skip");
});
console.log(`\n${n} testes passaram`);