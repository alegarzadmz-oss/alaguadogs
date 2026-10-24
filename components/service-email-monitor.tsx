"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
type Data = {
  configured: boolean;
  sender: string;
  clientsWithoutEmail: number;
  jobs: {
    id: string;
    kind: string;
    visitId: string;
    recipient: string;
    status: string;
    sentAt: string | null;
    errorCode: string | null;
  }[];
  waiting: { kind: string; id: string }[];
};
async function fetchMailStatus(signal?: AbortSignal): Promise<Data> {
  const r = await fetch("/api/service-email", { cache: "no-store", signal });
  const v = await r.json();
  if (!r.ok) throw Error(v.error || "No se pudo consultar.");
  return v;
}
export function ServiceEmailMonitor() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  async function load() {
    try {
      const v = await fetchMailStatus();
      setData(v);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar.");
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetchMailStatus(controller.signal)
      .then((v) => {
        setData(v);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "No se pudo consultar.");
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="panel settings-card service-email-monitor">
      <div className="section-row">
        <h2>Correos automáticos de servicios</h2>
        <Button type="button" variant="outline" onClick={() => void load()}>
          Actualizar correos
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            Remitente: <strong>{data.sender}</strong>
          </p>
          <p>
            {data.configured
              ? "El envío automático está configurado."
              : "El envío automático espera la clave del servicio de correo."}
          </p>
          <p>
            {data.clientsWithoutEmail} fichas sin correo registrado.
            Administración puede capturarlo en Clientes y mascotas.
          </p>
          {!!data.waiting.length && (
            <p className="rh-warning">
              {data.waiting.length} cierres necesitan el correo del dueño para
              enviar su resumen.
            </p>
          )}
          {!data.jobs.length ? (
            <p className="muted">
              Aquí aparecerán los avisos enviados y los que necesiten atención.
            </p>
          ) : (
            <div className="service-email-jobs">
              {data.jobs.map((j) => (
                <div key={j.id}>
                  <strong>{j.recipient}</strong>
                  <span>
                    {(
                      {
                        pending: "Preparado",
                        sending: "Enviando",
                        sent: "Enviado",
                        retry: "Reintento automático",
                        failed: "Requiere revisión",
                        canceled: "Servicio modificado",
                      } as Record<string, string>
                    )[j.status] || j.status}
                    {j.sentAt
                      ? ` · ${new Date(j.sentAt).toLocaleString("es-MX", { timeZone: "America/Monterrey" })}`
                      : ""}
                  </span>
                  {j.errorCode && (
                    <small>
                      {j.errorCode === "configuration_missing"
                        ? "Falta configurar el remitente."
                        : j.errorCode === "review_after_retry_window"
                          ? "Revisar en Resend antes de reenviar para evitar duplicados."
                          : "Revisa el cierre del servicio antes de reintentar."}
                    </small>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="footnote">
            Los bañadores guardan fotos y cierres. Administración controla los
            contactos, WhatsApp y la revisión de los envíos.
          </p>
        </>
      )}
    </section>
  );
}
