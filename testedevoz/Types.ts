// Tipos compartilhados do módulo de voz do TrayCheck (CI-03).
// Nomes em português seguem o ERS; o adaptador com a API (openapi.yaml, em inglês) fica na camada de ações.

export type ItemStatus = "pendente" | "confirmado" | "pulado" | "divergente";

export interface ChecklistItem {
  id: string;
  name: string; // nome falado/exibido do instrumental
  expectedQty: number;
  status: ItemStatus;
  aliases?: string[]; // sinônimos opcionais ("kelly" para "Pinça Kelly curva")
}

/** Intenções que a voz pode produzir. Divergência e cancelamento NÃO têm voz (UC08 e RNF02: só toque). */
export type VoiceIntent =
  | { type: "confirm"; itemId: string; quantity?: number | undefined }
  | { type: "confirmCurrent"; quantity?: number | undefined }
  | { type: "skip" }
  | { type: "repeat" }
  | { type: "finish" }
  | { type: "start" }
  | { type: "ambiguous"; candidateIds: string[] }
  | { type: "unrecognized" };

export interface ParsedCommand {
  intent: VoiceIntent;
  transcript: string;
  confidence: number; // 0 = desconhecida (alguns navegadores não informam)
}

// ---------- Reconhecimento ----------

export interface Alternative {
  transcript: string;
  confidence: number;
}

export type RecognizerErrorCode =
  | "no-speech"
  | "audio-capture"
  | "not-allowed"
  | "network"
  | "aborted"
  | "unsupported"
  | "unknown";

/** Contrato único: Web Speech, Google STT (via backend) e o mock dos testes E2E implementam isto. */
export interface SpeechRecognizer {
  readonly supported: boolean;
  start(): void;
  stop(): void;
  onResult: ((alternatives: Alternative[]) => void) | null;
  onError: ((code: RecognizerErrorCode) => void) | null;
  onListeningChange: ((listening: boolean) => void) | null;
}

// ---------- Síntese ----------

export interface Synthesizer {
  readonly supported: boolean;
  speak(text: string): Promise<void>; // resolve quando termina (ou falha); nunca rejeita
  cancel(): void;
}

// ---------- Ações (quem fala com a API) ----------

export interface ConfirmOutcome {
  status: "confirmado" | "divergente"; // o banco decide (RN07)
  foundQty: number;
  expectedQty: number;
  itemName: string;
}

export interface FinishOutcome {
  ok: boolean;
  pendingCount?: number; // RN01 / UC09-A1
}

export interface CheckActions {
  getItems(): ChecklistItem[];
  getCurrentItem(): ChecklistItem | undefined;
  confirmItem(itemId: string, quantity: number | undefined, recognizedText: string): Promise<ConfirmOutcome>;
  skipItem(itemId: string): Promise<void>;
  finish(): Promise<FinishOutcome>;
  start?(): Promise<void>;
}