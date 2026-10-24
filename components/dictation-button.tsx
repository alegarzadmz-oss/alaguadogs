"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import {
  createDictation,
  speechConstructor,
  type SpeechConstructor,
} from "@/lib/dictation";

export function DictationButton({
  value,
  onChange,
  disabled,
  onActiveChange,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  onActiveChange: (active: boolean) => void;
}) {
  const [active, setActive] = useState(false);
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState("");
  const session = useRef<ReturnType<typeof createDictation> | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function stopWhenHidden() {
      if (document.visibilityState === "hidden") {
        session.current?.cancel();
        setActive(false);
        setInterim("");
        onActiveChange(false);
      }
    }
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      session.current?.cancel();
    };
  }, [onActiveChange]);
  useEffect(() => {
    if (disabled) session.current?.stop();
  }, [disabled]);
  function toggle() {
    if (active) {
      session.current?.stop();
      return;
    }
    if (disabled) return;
    setMessage("");
    if (value.length >= 2000) {
      setMessage(
        "El mensaje llegó al límite. Revisa o acorta el texto antes de dictar más.",
      );
      return;
    }
    const Constructor = speechConstructor(
      window as unknown as {
        SpeechRecognition?: SpeechConstructor;
        webkitSpeechRecognition?: SpeechConstructor;
      },
    );
    if (!Constructor) {
      setMessage(
        "Este navegador no ofrece dictado integrado. Toca el campo de texto y usa el micrófono del teclado del celular.",
      );
      return;
    }
    try {
      session.current?.cancel();
      session.current = createDictation(new Constructor(), value, {
        onText: onChange,
        onInterim: setInterim,
        onError: setMessage,
        onEnd: () => {
          setActive(false);
          onActiveChange(false);
          button.current?.focus();
        },
      });
      setActive(true);
      onActiveChange(true);
      session.current.start();
    } catch {
      setActive(false);
      onActiveChange(false);
      setMessage(
        "No se pudo iniciar el dictado. Puedes usar el micrófono del teclado.",
      );
    }
  }
  return (
    <div className="akira-dictation">
      <button
        ref={button}
        type="button"
        className={`akira-mic ${active ? "is-listening" : ""}`}
        aria-label={active ? "Terminar dictado" : "Dictar mensaje a Akira"}
        aria-pressed={active}
        disabled={disabled && !active}
        onClick={toggle}
      >
        {active ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
      </button>
      <div
        className="akira-dictation-feedback"
        role="status"
        aria-live="polite"
      >
        {active ? (
          <>
            <strong>Escuchando…</strong>
            <span>
              {interim || "Habla en español. Toca el cuadrado para terminar."}
            </span>
          </>
        ) : (
          message || null
        )}
      </div>
    </div>
  );
}
