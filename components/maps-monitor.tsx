"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Van } from "@/lib/operations";

type Usage = {
  month: string;
  connected: boolean;
  services: Record<
    "routes" | "geocoding",
    { used: number; limit: number; remaining: number }
  >;
};
type Result = {
  matches?: { formattedAddress: string; granularity?: string }[];
  stops?: {
    id: string;
    client: string;
    address: string;
    travelMinutes: number;
  }[];
  distanceKm?: number;
  drivingMinutes?: number;
  returnMinutes?: number;
  warning?: string;
};
export function MapsMonitor({
  vans,
  date: initialDate,
}: {
  vans: Van[];
  date: string;
}) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [vanId, setVanId] = useState(vans[0]?.id || "");
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/maps", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        setUsage(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "No se pudo consultar el consumo.",
          );
      });
    return () => controller.abort();
  }, []);
  async function query(action: "route" | "geocode") {
    if (busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "route"
            ? { action, date, vanId }
            : { action, target: "base" },
        ),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      setResult(data.result);
      setUsage(data.usage);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo completar la consulta.",
      );
    } finally {
      // Errors/timeouts also consume a reservation; refresh without another Maps call.
      try {
        const r = await fetch("/api/maps", { cache: "no-store" });
        if (r.ok) setUsage(await r.json());
      } catch {}
      setBusy(false);
    }
  }
  return (
    <section
      className="panel maps-panel"
      aria-labelledby="maps-heading"
      aria-busy={busy}
    >
      <h2 id="maps-heading">Google Maps · consumo de las cuatro VAN</h2>
      <p className="muted">
        {usage?.connected ? "Conexión configurada" : "Comprobando conexión"} ·{" "}
        {usage?.month || "Mes actual"}. Límites compartidos; se restablecen el
        día 1, hora de Monterrey.
      </p>
      {usage && (
        <div className="settings-grid">
          {(["routes", "geocoding"] as const).map((key) => (
            <div key={key}>
              <strong>
                {key === "routes"
                  ? "Cálculos de rutas"
                  : "Consultas de domicilios"}
              </strong>
              <p>
                {usage.services[key].used.toLocaleString("es-MX")} de{" "}
                {usage.services[key].limit.toLocaleString("es-MX")} · quedan{" "}
                {usage.services[key].remaining.toLocaleString("es-MX")}
              </p>
              <progress
                aria-label={
                  key === "routes"
                    ? "Consumo de rutas"
                    : "Consumo de domicilios"
                }
                value={usage.services[key].used}
                max={usage.services[key].limit}
              />
            </div>
          ))}
        </div>
      )}
      <p className="muted">
        Al llegar a 1,000 intentos por función se bloquean nuevas consultas de
        esa función. Las alertas de facturación de Google son de $85, $136 y
        $170 MXN; avisan por correo y no detienen cargos.
      </p>
      <div className="form-grid">
        <div>
          <Label htmlFor="maps-date">Fecha del recorrido</Label>
          <Input
            id="maps-date"
            type="date"
            value={date}
            disabled={busy}
            onChange={(e) => {
              setDate(e.target.value);
              setResult(null);
            }}
          />
        </div>
        <div>
          <Label htmlFor="maps-van">VAN</Label>
          <select
            id="maps-van"
            className="maps-select"
            disabled={busy}
            value={vanId}
            onChange={(e) => {
              setVanId(e.target.value);
              setResult(null);
            }}
          >
            {vans.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="section-row maps-actions">
        <Button
          disabled={
            busy ||
            !usage?.connected ||
            !usage.services.routes.remaining ||
            !date ||
            !vanId
          }
          onClick={() => void query("route")}
        >
          Consultar recorrido por calles
        </Button>
        <Button
          variant="outline"
          disabled={
            busy || !usage?.connected || !usage.services.geocoding.remaining
          }
          onClick={() => void query("geocode")}
        >
          Revisar ubicación de base
        </Button>
      </div>
      <p className="muted">
        Cada botón realiza una consulta. El recorrido propone un orden, incluye
        el regreso a base y conserva la agenda actual. Completa primero el
        domicilio de la base.
      </p>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {busy && <p role="status">Consultando Google Maps…</p>}
      {result && (
        <div role="status" className="maps-result">
          {result.matches && (
            <>
              <h3>Ubicación de la base · Google Maps</h3>
              {result.matches.length ? (
                result.matches.map((m, i) => (
                  <p key={i}>
                    {m.formattedAddress}
                    {m.granularity === "ROOFTOP"
                      ? " · Ubicación puntual"
                      : " · Ubicación aproximada: revisar el número y punto de acceso"}
                  </p>
                ))
              ) : (
                <p>No se encontró una ubicación. Revisa el domicilio.</p>
              )}
              <p className="muted">
                Resultado para revisión. No se guardaron coordenadas.
              </p>
            </>
          )}
          {result.stops && (
            <>
              <h3>Recorrido sugerido · Google Maps</h3>
              <p>
                {result.distanceKm} km · {result.drivingMinutes} min totales
                estimados de manejo, incluido el regreso a base. El tiempo de
                baño y corte se suma por separado.
              </p>
              <ol>
                {result.stops.map((s) => (
                  <li key={s.id}>
                    <strong>{s.client}</strong> · {s.address} ·{" "}
                    {s.travelMinutes} min de traslado estimado
                  </li>
                ))}
              </ol>
              <p>
                Del total, {result.returnMinutes} min corresponden al regreso a
                base.
              </p>
              <p className="muted">{result.warning}</p>
            </>
          )}
          <a
            href="https://maps.google.com/"
            className="maps-attribution"
            translate="no"
            target="_blank"
            rel="noreferrer"
          >
            Google Maps
          </a>
        </div>
      )}
    </section>
  );
}
