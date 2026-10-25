"use client";
import { useEffect, useRef, useState } from "react";
import { Archive, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
type Run = {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: "running" | "succeeded" | "failed";
  bytes: number | null;
  photo_count: number | null;
  verification: {
    verifiedAt: string;
    clients: number;
    tables: Record<string, number>;
  } | null;
  error_code: string | null;
};
type Data = {
  overdue: boolean;
  configured: boolean;
  schedule: string;
  retentionDays: number;
  runs: Run[];
};
const when = (value: string) =>
  new Date(value).toLocaleString("es-MX", { timeZone: "America/Monterrey" });
export function BackupMonitor() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const locked = useRef(false);
  useEffect(() => {
    const abort = new AbortController();
    void fetch("/api/backups", { cache: "no-store", signal: abort.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!abort.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(e.message || "No se pudo consultar el respaldo.");
      });
    return () => abort.abort();
  }, [revision]);
  async function create() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: crypto.randomUUID() }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar el respaldo.",
      );
      setRevision((n) => n + 1);
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  const success = data?.runs.find((r) => r.status === "succeeded"),
    latest = data?.runs[0];
  const overdue = data?.overdue;
  return (
    <section
      className="panel backup-monitor"
      aria-label="Respaldos de Google Cloud"
    >
      <div className="section-row">
        <div>
          <h2>
            <Archive size={20} /> Respaldos de Google Cloud
          </h2>
          <p className="muted">
            Copias privadas de clientes, mascotas, agenda, pagos, rutas, equipo
            y fotos de servicios.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setError("");
            setRevision((n) => n + 1);
          }}
        >
          <RefreshCw size={15} /> Actualizar estado
        </Button>
      </div>
      {!data && !error && <p role="status">Consultando respaldos…</p>}
      {data && !data.configured && (
        <p>
          Falta conectar el almacenamiento privado de Google Cloud. La
          programación se activará al completar esa conexión.
        </p>
      )}
      {data?.configured && (
        <>
          <p>
            {data.schedule}. Conservación de copias: {data.retentionDays} días.
            Las fotos se archivan por separado para evitar duplicarlas.
          </p>
          <p className="muted">
            Cada copia se descarga y restaura en un espacio de prueba aislado
            para comprobar que se puede recuperar.
          </p>
          <p className="muted">
            Puedes crear hasta tres respaldos manuales al día.
          </p>
          {success?.verification ? (
            <div className="message success">
              <ShieldCheck size={20} />
              <div>
                <strong>Restauración comprobada</strong>
                <p>
                  {when(success.verification.verifiedAt)} ·{" "}
                  {success.verification.clients} clientes ·{" "}
                  {success.photo_count} fotos
                </p>
              </div>
            </div>
          ) : (
            <p>La primera restauración todavía no se ha comprobado.</p>
          )}
          {latest?.status === "running" && (
            <p role="status">
              Hay un respaldo en curso. Actualiza el estado en unos minutos.
            </p>
          )}
          {(latest?.status === "failed" || overdue) && (
            <p className="message error" role="alert">
              {overdue
                ? "Han pasado más de 36 horas desde el último respaldo comprobado."
                : "El último intento no terminó correctamente."}{" "}
              Revisa la conexión y vuelve a crear un respaldo.{" "}
              {latest?.error_code === "photo_storage_limit"
                ? "El archivo de fotos alcanzó su límite de 1 GB."
                : ""}
            </p>
          )}
          <Button
            onClick={() => void create()}
            disabled={busy || latest?.status === "running"}
          >
            {busy
              ? "Creando y comprobando…"
              : "Crear y comprobar respaldo ahora"}
          </Button>
        </>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <p className="muted">
        Las recuperaciones de prueba no reemplazan los datos de la operación.
      </p>
    </section>
  );
}
