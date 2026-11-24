import type { Synthesizer } from "./Types.ts";

export class BrowserSynthesizer implements Synthesizer {
  private voice: SpeechSynthesisVoice | undefined;
  private readonly lang: string;
  private readonly rate: number;

  constructor(lang = "pt-BR", rate = 1.05) {
    this.lang = lang;
    this.rate = rate;
    if (this.supported) {
      this.pickVoice();
      speechSynthesis.addEventListener("voiceschanged", () => this.pickVoice()); // lista carrega assíncrona
    }
  }

  get supported() { return typeof speechSynthesis !== "undefined"; }

  private pickVoice() {
    const voices = speechSynthesis.getVoices();
    this.voice = voices.find((v) => v.lang === this.lang) ?? voices.find((v) => v.lang.startsWith(this.lang.slice(0, 2)));
  }

  speak(text: string): Promise<void> {
    if (!this.supported) return Promise.resolve();
    this.cancel(); // frase nova interrompe a anterior: nunca acumula fila durante a cirurgia
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang;
      u.rate = this.rate;
      if (this.voice) u.voice = this.voice;
      // Alguns navegadores não disparam "end" em falhas: timer de segurança evita travar o fluxo.
      const guard = setTimeout(resolve, 3000 + text.length * 90);
      const done = () => { clearTimeout(guard); resolve(); };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  cancel() { if (this.supported) speechSynthesis.cancel(); }
}