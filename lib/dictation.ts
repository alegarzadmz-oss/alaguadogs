export type SpeechResult = {
  isFinal: boolean;
  readonly [index: number]: { transcript: string };
};
export type SpeechRecognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
export type SpeechConstructor = new () => SpeechRecognizer;
export function speechConstructor(scope: {
  SpeechRecognition?: SpeechConstructor;
  webkitSpeechRecognition?: SpeechConstructor;
}): SpeechConstructor | undefined {
  return scope.SpeechRecognition || scope.webkitSpeechRecognition;
}
export function appendDictation(base: string, spoken: string, limit = 2000) {
  const text = spoken.trim();
  return (
    text ? `${base.trimEnd()}${base.trim() ? " " : ""}${text}` : base
  ).slice(0, limit);
}
export function speechError(code: string) {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "No se autorizó el dictado. Permite el micrófono en los ajustes del sitio o usa el micrófono del teclado.";
    case "audio-capture":
      return "No se pudo acceder al micrófono. Revisa que esté disponible y que otra llamada no lo esté usando.";
    case "no-speech":
      return "No se detectó voz. Toca el micrófono para intentar de nuevo.";
    case "network":
      return "El servicio de dictado no pudo conectarse. Revisa tu conexión o usa el micrófono del teclado.";
    case "language-not-supported":
      return "El navegador no admite dictado en español. Puedes usar el micrófono del teclado.";
    default:
      return "No se pudo completar el dictado. Puedes intentarlo de nuevo o usar el micrófono del teclado.";
  }
}

// A session handles one utterance. It never submits a message or stores audio.
export function createDictation(
  recognizer: SpeechRecognizer,
  base: string,
  callbacks: {
    onText(value: string): void;
    onInterim(value: string): void;
    onEnd(): void;
    onError(message: string): void;
  },
  limit = 2000,
) {
  let live = true;
  let stopping = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function detach() {
    live = false;
    clearTimeout(timeout);
    recognizer.onstart = null;
    recognizer.onend = null;
    recognizer.onerror = null;
    recognizer.onresult = null;
  }
  function end() {
    if (!live) return;
    detach();
    callbacks.onInterim("");
    callbacks.onEnd();
  }
  function cancel() {
    if (!live) return;
    detach();
    try {
      recognizer.abort();
    } catch {}
  }
  function stop() {
    if (!live || stopping) return;
    stopping = true;
    clearTimeout(timeout);
    try {
      recognizer.stop();
      // Some mobile implementations never deliver end after a stopped session.
      if (live)
        timeout = setTimeout(() => {
          cancel();
          callbacks.onInterim("");
          callbacks.onEnd();
        }, 5000);
    } catch {
      end();
      try {
        recognizer.abort();
      } catch {}
    }
  }
  recognizer.lang = "es-MX";
  recognizer.continuous = false;
  recognizer.interimResults = true;
  recognizer.maxAlternatives = 1;
  recognizer.onresult = ({ results }) => {
    if (!live) return;
    const all = Array.from(results);
    const final = all
      .filter((r) => r.isFinal)
      .map((r) => r[0]?.transcript || "")
      .join(" ");
    const interim = all
      .filter((r) => !r.isFinal)
      .map((r) => r[0]?.transcript || "")
      .join(" ");
    // Rebuild from the original text: repeated result events cannot duplicate it.
    callbacks.onText(appendDictation(base, final, limit));
    callbacks.onInterim(interim.slice(0, limit));
    if (appendDictation(base, final, limit).length >= limit) stop();
  };
  recognizer.onerror = ({ error }) => {
    if (!live) return;
    if (error !== "aborted") callbacks.onError(speechError(error));
    end();
    try {
      recognizer.abort();
    } catch {}
  };
  recognizer.onend = end;
  return {
    start() {
      if (!live) return;
      try {
        recognizer.start();
        if (live) timeout = setTimeout(stop, 60000);
      } catch {
        callbacks.onError(
          "No se pudo iniciar el micrófono. Intenta de nuevo o usa el dictado del teclado.",
        );
        end();
        try {
          recognizer.abort();
        } catch {}
      }
    },
    stop,
    cancel,
  };
}
