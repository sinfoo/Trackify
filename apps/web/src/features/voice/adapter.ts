// Speech-to-text / text-to-speech behind one small interface so a server provider can replace the browser later.
// Audio never leaves the browser with BrowserSpeechAdapter; only the final transcript is sent as a chat message.

export type ListenState = "idle" | "listening" | "denied" | "unsupported" | "error";

export interface ListenHandlers {
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onState: (state: ListenState, detail?: string) => void;
}

export interface SpeechAdapter {
  readonly canListen: boolean;
  readonly canSpeak: boolean;
  /** Starts one utterance of recognition. Returns a stop function. */
  listen(handlers: ListenHandlers, lang?: string): () => void;
  speak(text: string): void;
  cancelSpeech(): void;
}

// Minimal local typing: SpeechRecognition is not in every lib.dom version.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Preferred voice name, set elsewhere in the app (localStorage `voice.name`). */
function preferredVoice(): SpeechSynthesisVoice | undefined {
  const name = localStorage.getItem("voice.name");
  const voices = window.speechSynthesis.getVoices();
  return (name ? voices.find((v) => v.name === name) : undefined) ?? voices.find((v) => v.lang.startsWith("en"));
}

export class BrowserSpeechAdapter implements SpeechAdapter {
  get canListen() {
    return recognitionCtor() !== null;
  }
  get canSpeak() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  listen(h: ListenHandlers, lang = "en-US") {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      h.onState("unsupported");
      return () => {};
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    let failed = false;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      h.onInterim?.(finalText + interim);
    };
    rec.onerror = (e) => {
      failed = true;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") h.onState("denied");
      else if (e.error === "no-speech" || e.error === "aborted") h.onState("idle");
      else h.onState("error", e.error);
    };
    rec.onend = () => {
      if (!failed) h.onState("idle");
      if (finalText.trim()) h.onFinal(finalText.trim());
    };
    try {
      rec.start();
      h.onState("listening");
    } catch {
      h.onState("error", "start_failed");
    }
    return () => rec.stop();
  }

  speak(text: string) {
    if (!this.canSpeak || !text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const say = () => {
      const u = new SpeechSynthesisUtterance(text);
      const v = preferredVoice();
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      synth.speak(u);
    };
    // Voices load asynchronously on first use in Chrome.
    if (synth.getVoices().length) say();
    else synth.addEventListener("voiceschanged", say, { once: true });
  }

  cancelSpeech() {
    if (this.canSpeak) window.speechSynthesis.cancel();
  }
}
