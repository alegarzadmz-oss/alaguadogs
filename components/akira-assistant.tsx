"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ArrowUp, Check, LoaderCircle, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DictationButton } from "@/components/dictation-button";
import type { Command } from "@/lib/operations";
import type { AkiraMessage, AkiraProposal } from "@/lib/akira";
import type { SavedRoute } from "@/lib/saved-routes";

type Message = AkiraMessage & {
  proposals?: (AkiraProposal & { revision: number })[];
  roadRoutes?: SavedRoute[];
};
export function AkiraAssistant({
  date,
  revision,
  busy,
  onSave,
  onNavigate,
  onRoadRoute,
}: {
  date: string;
  revision: number;
  busy: boolean;
  onSave: (command: Command, operationId?: string) => Promise<boolean>;
  onNavigate: (date: string, view: "agenda" | "routes") => void;
  onRoadRoute: (route: SavedRoute) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [dictating, setDictating] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const lock = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  function scrollToLatest() {
    requestAnimationFrame(() =>
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
    );
  }
  async function send(text: string) {
    const value = text.trim();
    if (!value || lock.current || busy || dictating) return;
    lock.current = true;
    setSending(true);
    setError("");
    setInput("");
    const next: Message[] = [...messages, { role: "user", content: value }];
    setMessages(next);
    scrollToLatest();
    try {
      const response = await fetch("/api/akira", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          messages: next.slice(-6).map(({ role, content }) => ({
            role,
            content: content.slice(0, 4000),
          })),
        }),
      });
      const data = (await response.json()) as {
        reply: string;
        proposals: AkiraProposal[];
        roadRoutes?: SavedRoute[];
        revision: number;
        error?: string;
      };
      if (!response.ok)
        throw Error(data.error || "Akira no pudo responder. Intenta de nuevo.");
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data.reply,
          roadRoutes: data.roadRoutes || [],
          proposals: data.proposals.map((p) => ({
            ...p,
            revision: data.revision,
          })),
        },
      ]);
    } catch (e) {
      setMessages(messages);
      setInput(value);
      setError(
        e instanceof Error ? e.message : "No se pudo conectar con Akira.",
      );
    } finally {
      lock.current = false;
      setSending(false);
      scrollToLatest();
    }
  }
  async function confirm(p: AkiraProposal & { revision: number }) {
    if (lock.current || busy || dictating || saved.includes(p.id)) return;
    if (p.revision !== revision) {
      setError(
        "La agenda cambió desde esta propuesta. Pide a Akira una propuesta actualizada antes de confirmar.",
      );
      return;
    }
    lock.current = true;
    setSaving(p.id);
    setError("");
    try {
      if (!(await onSave(p.command, `akira-${p.id}`))) {
        setError(
          "No se pudo guardar la propuesta. Revisa el aviso del portal y solicita una propuesta actualizada si cambió la agenda.",
        );
        return;
      }
      setSaved((current) => [...current, p.id]);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content:
            p.kind === "booking"
              ? "Cita guardada en la agenda. Ya puedes verla con su VAN y horario."
              : "Orden aplicado. Los nuevos horarios ya aparecen en la agenda.",
        },
      ]);
      const appointment = p.command.appointment as { date: string } | undefined;
      onNavigate(
        appointment?.date || String(p.command.date),
        p.kind === "booking" ? "agenda" : "routes",
      );
      scrollToLatest();
    } finally {
      lock.current = false;
      setSaving(null);
    }
  }
  return (
    <>
      <button
        className="akira-launcher"
        onClick={() => setOpen(true)}
        aria-label="Hablar con Akira, asistente de agenda y rutas"
      >
        <Image src="/brand/akira-boxer.png" alt="" width={64} height={64} />
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setDictating(false);
        }}
      >
        <DialogContent className="akira-dialog">
          <DialogHeader className="akira-header">
            <Image
              src="/brand/akira-boxer.png"
              alt="Akira, un perrito bóxer"
              width={68}
              height={68}
            />
            <div>
              <DialogTitle>Hola, soy Akira</DialogTitle>
              <DialogDescription>
                Tu compañero de agenda y rutas
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="akira-context">
            <span>AL’AGUA DOGS · Administración</span>
            <span>{date.split("-").reverse().join("/")}</span>
          </div>
          <div
            className="akira-conversation"
            role="log"
            aria-label="Conversación con Akira"
            aria-live="polite"
            aria-busy={sending}
          >
            {!messages.length && (
              <div className="akira-welcome">
                <Image
                  src="/brand/akira-boxer.png"
                  alt=""
                  width={144}
                  height={144}
                />
                <h3>Una agenda que va contigo.</h3>
                <p>
                  Te ayudo a encontrar clientes, preparar citas y organizar las
                  visitas de las cuatro VAN.
                </p>
                <div className="akira-starters">
                  <button
                    onClick={() =>
                      void send(
                        `Revisa qué falta para optimizar las rutas de las cuatro VAN del ${date}, considerando salida y regreso a base, ubicaciones y horarios.`,
                      )
                    }
                  >
                    Revisar preparación de rutas
                  </button>
                  <button
                    disabled={dictating}
                    onClick={() => {
                      setInput("Quiero agendar una cita para ");
                    }}
                  >
                    Agendar una cita
                  </button>
                  <button
                    onClick={() =>
                      void send(`Muéstrame la agenda del ${date}.`)
                    }
                  >
                    Ver la agenda
                  </button>
                  <button
                    onClick={() =>
                      void send(`Ayúdame a organizar una ruta para el ${date}.`)
                    }
                  >
                    Organizar una ruta
                  </button>
                </div>
                <small>
                  Las citas y cambios de ruta se guardan cuando confirmas su
                  tarjeta.
                </small>
              </div>
            )}
            {messages.map((message, i) => (
              <div className={`akira-message akira-${message.role}`} key={i}>
                {message.role === "assistant" && (
                  <span className="akira-speaker">AKIRA</span>
                )}
                <p>{message.content}</p>
                {message.roadRoutes?.map((route) => (
                  <section
                    className="akira-proposal"
                    key={route.id}
                    aria-label={`Ruta guardada de ${route.van}`}
                  >
                    <strong>
                      {route.van} · {route.date.split("-").reverse().join("/")}
                    </strong>
                    <p>
                      {route.stops.length} paradas · Propuesta guardada en la
                      ficha de la VAN. Sigue disponible al recargar.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setOpen(false);
                        setDictating(false);
                        onRoadRoute(route);
                      }}
                    >
                      Ver ruta guardada
                    </Button>
                  </section>
                ))}
                {message.proposals?.map((p) => (
                  <section
                    className="akira-proposal"
                    key={p.id}
                    aria-label={p.title}
                  >
                    <strong>{p.title}</strong>
                    <ul>
                      {p.details.map((d, j) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ul>
                    <details>
                      <summary>Qué revisar antes de confirmar</summary>
                      <ul>
                        {p.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </details>
                    <Button
                      disabled={
                        busy ||
                        sending ||
                        !!saving ||
                        dictating ||
                        saved.includes(p.id)
                      }
                      onClick={() => void confirm(p)}
                    >
                      {saved.includes(p.id) ? (
                        <>
                          <Check size={16} /> Guardado
                        </>
                      ) : saving === p.id ? (
                        <>
                          <LoaderCircle className="akira-spin" size={16} />{" "}
                          Guardando…
                        </>
                      ) : p.kind === "booking" ? (
                        "Confirmar y agendar"
                      ) : (
                        "Confirmar y aplicar orden"
                      )}
                    </Button>
                  </section>
                ))}
              </div>
            ))}
            {sending && (
              <div className="akira-thinking">
                <LoaderCircle size={16} className="akira-spin" /> Akira está
                revisando…
              </div>
            )}
            <div ref={bottom} />
          </div>
          <div className="akira-composer">
            {error && (
              <p className="akira-error" role="alert">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <label className="sr-only" htmlFor="akira-input">
                Mensaje para Akira
              </label>
              <textarea
                id="akira-input"
                value={input}
                maxLength={2000}
                rows={2}
                placeholder="Ej. Quiero agendar a Nicky para mañana…"
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send(input);
                  }
                }}
                disabled={sending || !!saving}
                readOnly={dictating}
              />
              {open && (
                <DictationButton
                  value={input}
                  onChange={setInput}
                  disabled={sending || !!saving || busy}
                  onActiveChange={setDictating}
                />
              )}
              <button
                className="akira-send"
                type="submit"
                aria-label="Enviar mensaje a Akira"
                disabled={
                  !input.trim() || sending || !!saving || busy || dictating
                }
              >
                <ArrowUp size={21} />
              </button>
            </form>
            <p className="akira-voice-note">
              Dicta, revisa y envía. Usa el micrófono con la VAN detenida.
              El dictado utiliza el servicio de voz de tu navegador.
            </p>
            <div className="akira-composer-note">
              <span>IA conversacional · Revisa las propuestas</span>
              <button
                disabled={sending || !!saving || dictating}
                onClick={() => {
                  setMessages([]);
                  setSaved([]);
                  setError("");
                  setInput("");
                }}
                aria-label="Nueva conversación con Akira"
              >
                <RotateCcw size={13} /> Nueva conversación
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
