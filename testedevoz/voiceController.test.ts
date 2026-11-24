<<<<<<< Updated upstream
import assert from "node:assert/strict";
import { VoiceController } from "./voiceController.js";
=======
import * as assert from "./testHelpers.ts";
import { VoiceController } from "./voiceController.ts";
>>>>>>> Stashed changes
import { MockRecognizer } from "./mockRecognizer.ts";
import type { CheckActions, ChecklistItem, Synthesizer } from "./Types.ts";

const items: ChecklistItem[] = [
  { id: "1", name: "Pinça Kelly", expectedQty: 3, status: "pendente" },
  { id: "2", name: "Tesoura", expectedQty: 2, status: "pendente" },
];
const spoken: string[] = [];
const tts: Synthesizer = { supported: true, speak: async (t) => { spoken.push(t); }, cancel() {} };
const actions: CheckActions = {
  getItems: () => items,
  getCurrentItem: () => items.find((i) => i.status === "pendente"),
  async confirmItem(id, q) {
    const it = items.find((i) => i.id === id)!; const found = q ?? it.expectedQty;
    it.status = found === it.expectedQty ? "confirmado" : "divergente";
    return { status: it.status as "confirmado" | "divergente", foundQty: found, expectedQty: it.expectedQty, itemName: it.name };
  },
  async skipItem(id) { items.find((i) => i.id === id)!.status = "pulado"; },
  async finish() { const p = items.filter((i) => i.status === "pendente").length; return p ? { ok: false, pendingCount: p } : { ok: true }; },
};
const tick = () => new Promise((r) => setTimeout(r, 5));

(async () => {
  const rec = new MockRecognizer(); const modes: string[] = [];
  const c = new VoiceController(rec, tts, actions, { onModeChange: (m, r) => modes.push(`${m}:${r ?? ""}`) });
  await c.begin();
  assert.match(spoken.at(-1)!, /Primeiro item: Pinça Kelly, quantidade 3/);
  assert.equal(rec.listening, true);

  rec.say("pinça kelly dois"); await tick(); // divergente (faltante)
  assert.match(spoken.at(-1)!, /Divergência faltante.*esperado 3, encontrado 2.*Próximo: Tesoura/);
  rec.say("finalizar"); await tick();
  assert.match(spoken.at(-1)!, /Ainda há 1 itens pendentes/);
  rec.say("pular"); await tick();
  rec.say("finalizar"); await tick();
  assert.match(spoken.at(-1)!, /Checagem finalizada/);
  console.log("ok - fluxo iniciar → confirmar(divergente) → finalizar recusado → pular → finalizar");

  // ruído repetido sugere toque; erro de microfone cai para toque
  items.forEach((i) => (i.status = "pendente"));
  const rec2 = new MockRecognizer(); const modes2: string[] = [];
  const c2 = new VoiceController(rec2, tts, actions, { onModeChange: (m, r) => modes2.push(`${m}:${r ?? ""}`) });
  await c2.begin();
  for (let k = 0; k < 3; k++) { rec2.say("blablabla"); await tick(); }
  assert.ok(modes2.includes("voz:repeated-misrecognition"));
  rec2.fail("not-allowed");
  assert.ok(modes2.includes("toque:not-allowed"));
  assert.equal(rec2.listening, false);
  console.log("ok - 3 falhas sugerem toque; microfone negado → modo toque");
})();