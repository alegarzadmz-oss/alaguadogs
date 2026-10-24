import type { State } from "./operations";
import type { RouteVisit } from "./route-history";
import { validDay } from "./route-history";
import { mapsAddressQuery } from "./maps-plan";

export class SavedRouteError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type RouteStop = {
  id: string;
  clientId: string | null;
  client: string;
  address: string;
  time?: string;
  duration?: number;
  groomerId?: string;
};
export type RouteSource = {
  date: string;
  vanId: string;
  van: string;
  kind: "appointments" | "history";
  base: string;
  stops: RouteStop[];
};
export type SavedRoute = RouteSource & {
  id: string;
  status: "draft" | "active" | "replaced" | "withdrawn";
  createdAt: string;
  createdBy: string;
  publishedAt: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  revision: number;
  stale: boolean;
};
export type RouteGroomer = { id: string; name: string; vanId: string };

// Business data only: no provider response, coordinates, polylines, distances or
// travel estimates are persisted. The approved work order survives reloads.
export function routeSource(
  state: State,
  history: RouteVisit[],
  date: string,
  vanId: string,
): RouteSource {
  if (!validDay(date))
    throw new SavedRouteError("Selecciona una fecha válida.");
  const van = state.vans.find((v) => v.id === vanId);
  if (!van || !state.base.address.trim())
    throw new SavedRouteError("Revisa la VAN y el domicilio de base.");
  const appointments = state.appointments
    .filter(
      (a) => a.date === date && a.vanId === vanId && a.status !== "Cancelado",
    )
    .sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  const visits = history
    .filter((v) => v.date === date && v.vanId === vanId && !v.deletedAt)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (appointments.length && visits.length)
    throw new SavedRouteError(
      "Revisa la correspondencia entre citas y visitas de ruta de este día.",
    );
  const stops: RouteStop[] = appointments.length
    ? appointments.map((a) => {
        const c = state.clients.find((c) => c.id === a.clientId);
        return {
          id: a.id,
          clientId: a.clientId,
          client: c?.name || "Cliente por revisar",
          address: c?.address || "",
          time: a.time,
          duration: a.duration,
          groomerId: a.groomerId || "",
        };
      })
    : visits.map((v) => ({
        id: v.id,
        clientId: v.clientId,
        client: v.clientName,
        address: v.address,
      }));
  if (
    !stops.length ||
    stops.length > 25 ||
    stops.some((s) => !s.address.trim())
  )
    throw new SavedRouteError(
      "Revisa las visitas y sus domicilios antes de guardar la ruta.",
    );
  return {
    date,
    vanId,
    van: van.name,
    base: state.base.address,
    kind: appointments.length ? "appointments" : "history",
    stops,
  };
}
export function sourceIdentity(source: RouteSource) {
  return JSON.stringify({
    date: source.date,
    vanId: source.vanId,
    kind: source.kind,
    base: source.base,
    stops: source.stops,
  });
}
export function orderedSource(source: RouteSource, ids: string[]): RouteSource {
  const byId = new Map(source.stops.map((s) => [s.id, s]));
  if (
    ids.length !== source.stops.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !byId.has(id))
  )
    throw new SavedRouteError(
      "La propuesta debe conservar exactamente todas las visitas de la VAN.",
    );
  return { ...source, stops: ids.map((id) => byId.get(id)!) };
}
export function navigationURL(address: string) {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", mapsAddressQuery(address));
  url.searchParams.set("travelmode", "driving");
  url.searchParams.set("dir_action", "navigate");
  return url.href;
}
