import type { Alternative, RecognizerErrorCode, SpeechRecognizer } from "./Types.ts";

/** Reconhecedor falso para E2E/CI (RNF04): "fala" frases sem microfone. */
export class MockRecognizer implements SpeechRecognizer {
  supported = true;
  listening = false;
  onResult: SpeechRecognizer["onResult"] = null;
  onError: SpeechRecognizer["onError"] = null;
  onListeningChange: SpeechRecognizer["onListeningChange"] = null;

  start() { this.listening = true; this.onListeningChange?.(true); }
  stop() { this.listening = false; this.onListeningChange?.(false); }

  say(transcript: string, confidence = 0.9) { this.sayAlternatives([{ transcript, confidence }]); }
  sayAlternatives(alts: Alternative[]) { if (this.listening) this.onResult?.(alts); }
  fail(code: RecognizerErrorCode) { this.onError?.(code); }
}