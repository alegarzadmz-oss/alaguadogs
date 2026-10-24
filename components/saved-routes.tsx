"use client";
import { useEffect, useState } from "react";
import { Navigation, RefreshCw, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  navigationURL,
  type SavedRoute,
  type RouteGroomer,
} from "@/lib/saved-routes";

type Data = {
  routes: SavedRoute[];
  groomers: RouteGroomer[];
  canManage: boolean;
};
const label = (r: SavedRoute) =>
  r.stale
    ? "Requiere actualización"
    : r.status === "active"
      ? "Ruta del día publicada"
      : r.status === "replaced"
        ? "Versión anterior"
        : "Propuesta guardada";
const day = (date: string) => date.split("-").reverse().join("/");

function RouteCard({
  route,
  groomers,
  manage,
  onChange,
}: {
  route: SavedRoute;
  groomers: RouteGroomer[];
  manage: boolean;
  onChange: () => Promise<void>;
}) {
  const [groomerId, setGroomerId] = useState(route.assignedTo || "");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function publish() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/saved-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: route.id,
          revision: route.revision,
          groomerId,
          reviewed,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setReviewed(false);
      await onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo publicar la ruta.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={`saved-route-card ${route.status === "active" ? "saved-route-active" : ""}`}
      aria-label={`${route.van} del ${day(route.date)}`}
    >
      <header className="section-row">
        <div>
          <h3>
            {route.van} · {day(route.date)}
          </h3>
          <p className="muted">
            {label(route)} · {route.stops.length} paradas
          </p>
        </div>
        <span className="saved-route-badge">
          {route.status === "active" ? "Publicada" : "Borrador / historial"}
        </span>
      </header>
      {route.assignedName && (
        <p>
          Bañador asignado: <strong>{route.assignedName}</strong>
        </p>
      )}
      {route.stale ? (
        <p role="status" className="message error">
          La agenda, los domicilios o las asignaciones cambiaron. Administración
          debe revisar y generar una propuesta actualizada antes de seguir esta
          ruta.
        </p>
      ) : (
        <>
          <p className="saved-route-base">
            <MapPin size={16} /> Salida y regreso: {route.base}
          </p>
          {route.stops[0] && (
            <a
              className="saved-route-start"
              href={navigationURL(route.stops[0].address)}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation size={17} /> Iniciar ruta · primera parada
            </a>
          )}
        </>
      )}
      <ol className="saved-route-stops">
        {route.stops.map((stop, index) => (
          <li key={stop.id}>
            <span className="saved-route-number">{index + 1}</span>
            <div>
              <strong>{stop.client}</strong>
              <p>{stop.address}</p>
              {stop.time && (
                <small>
                  Hora registrada: {stop.time} · {stop.duration} min de servicio
                </small>
              )}
            </div>
            {!route.stale && (
              <a
                href={navigationURL(stop.address)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Cómo llegar a ${stop.client}, parada ${index + 1}`}
              >
                Cómo llegar <Navigation size={14} />
              </a>
            )}
          </li>
        ))}
      </ol>
      {!route.stale && (
        <a
          className="saved-route-return"
          href={navigationURL(route.base)}
          target="_blank"
          rel="noreferrer"
        >
          Regresar a la base <Navigation size={14} />
        </a>
      )}
      <p className="muted">
        El orden y los domicilios están guardados. Google Maps abre las
        indicaciones de cada parada desde tu ubicación actual.
      </p>
      {route.kind === "history" && (
        <p className="muted">
          Estas visitas aún no tienen horario confirmado. El orden de recorrido
          no confirma horas de llegada ni tiempos de baño o corte.
        </p>
      )}
      {manage && !route.stale && route.status !== "replaced" && (
        <div className="saved-route-publish">
          {!groomers.length ? (
            <p>
              Para entregar esta ruta, agrega y activa la cuenta del bañador en{" "}
              <strong>Equipo y servicios</strong>. La propuesta ya está
              guardada.
            </p>
          ) : (
            <>
              <label>
                Bañador que seguirá la ruta
                <select
                  value={groomerId}
                  disabled={busy}
                  onChange={(e) => setGroomerId(e.target.value)}
                >
                  <option value="">Seleccionar bañador</option>
                  {groomers.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="saved-route-review">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={busy}
                  onChange={(e) => setReviewed(e.target.checked)}
                />{" "}
                Revisé los domicilios, los puntos de acceso y el orden para este
                día.
              </label>
              <Button
                disabled={busy || !groomerId || !reviewed}
                onClick={() => void publish()}
              >
                {busy ? "Publicando…" : "Publicar ruta para el bañador"}
              </Button>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
    </article>
  );
}

export function SavedRoutes({
  from,
  to = from,
  vanId,
  title = "Rutas guardadas de Akira",
}: {
  from: string;
  to?: string;
  vanId?: string;
  title?: string;
}) {
  const query = new URLSearchParams({
    from,
    to,
    ...(vanId ? { vanId } : {}),
  }).toString();
  return (
    <RouteCollection
      key={query}
      query={query}
      from={from}
      to={to}
      vanId={vanId}
      title={title}
    />
  );
}

function RouteCollection({
  query,
  from,
  to,
  vanId,
  title,
}: {
  query: string;
  from: string;
  to: string;
  vanId?: string;
  title: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/saved-routes?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const next = await response.json();
        if (!response.ok) throw Error(next.error);
        if (!controller.signal.aborted) setData(next);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "No se pudieron cargar las rutas.",
          );
      });
    return () => controller.abort();
  }, [query, reload]);
  async function refresh() {
    setData(null);
    setError("");
    setReload((n) => n + 1);
  }
  async function generate() {
    if (busy || !vanId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "route", date: from, vanId }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo generar la propuesta.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel saved-routes-panel" aria-label={title}>
      <div className="section-row">
        <div>
          <h2>{title}</h2>
          <p className="muted">
            {from === to ? day(from) : `${day(from)} al ${day(to)}`}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void refresh()}
          disabled={busy}
        >
          <RefreshCw size={15} /> Actualizar rutas
        </Button>
      </div>
      {data?.canManage && (
        <p className="muted">
          Las propuestas se guardan automáticamente. Revisa una, elige al
          bañador y publícala para que aparezca en su agenda del día.
        </p>
      )}
      {data?.canManage && vanId && from === to && (
        <Button onClick={() => void generate()} disabled={busy}>
          {busy
            ? "Calculando y guardando…"
            : "Generar y guardar propuesta con Google Maps"}
        </Button>
      )}
      {!data && !error && <p role="status">Cargando rutas guardadas…</p>}
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {data?.routes.map((route) => (
        <RouteCard
          key={`${route.id}:${route.revision}`}
          route={route}
          groomers={data.groomers}
          manage={data.canManage}
          onChange={refresh}
        />
      ))}
      {data && !data.routes.length && (
        <p>
          {data.canManage
            ? "No hay propuestas guardadas para esta selección. Pide a Akira que calcule las rutas del día o selecciona una camioneta para generar su propuesta."
            : "Administración todavía no ha publicado una ruta para tu cuenta en este día."}
        </p>
      )}
    </section>
  );
}

export function DailyRouteButton({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="daily-route-button" onClick={() => setOpen(true)}>
        <Navigation /> Ver mi ruta del día
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="daily-route-dialog">
          <DialogHeader>
            <DialogTitle>Mi ruta · {day(date)}</DialogTitle>
            <DialogDescription>
              Paradas publicadas por Administración para tu cuenta.
            </DialogDescription>
          </DialogHeader>
          {open && <SavedRoutes from={date} title="Ruta a seguir" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
