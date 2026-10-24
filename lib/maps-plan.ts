import type { State } from "./operations";
import type { RouteVisit } from "./route-history";
import { validDay } from "./route-history";
import { MapsError } from "./maps-policy";

export function mapsRoutePlan(
  state: State,
  history: RouteVisit[],
  date: string,
  vanId: string,
) {
  if (!validDay(date)) throw new MapsError("Selecciona una fecha válida.");
  const van = state.vans.find((v) => v.id === vanId);
  if (!van) throw new MapsError("Selecciona una camioneta existente.");
  if (!state.base.address.trim())
    throw new MapsError(
      "Configura primero el domicilio de la base en Equipo y servicios.",
    );
  const appointments = state.appointments
    .filter(
      (a) => a.date === date && a.vanId === vanId && a.status !== "Cancelado",
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  const visits = history
    .filter((v) => v.date === date && v.vanId === vanId && !v.deletedAt)
    .sort((a, b) => a.order - b.order);
  if (appointments.length && visits.length)
    throw new MapsError(
      "Este día tiene citas y visitas de ruta. Revisa su correspondencia antes de calcular un nuevo orden.",
    );
  if (appointments.some((a) => a.status !== "Confirmado"))
    throw new MapsError(
      "La camioneta tiene servicios iniciados o completados. Conserva su recorrido actual.",
    );
  const stops = appointments.length
    ? appointments.map((a) => {
        const c = state.clients.find((c) => c.id === a.clientId);
        return {
          id: a.id,
          client: c?.name || "Cliente por revisar",
          address: c?.address || "",
        };
      })
    : visits.map((v) => ({
        id: v.id,
        client: v.clientName,
        address: v.address,
      }));
  if (!stops.length)
    throw new MapsError(
      "Esta camioneta no tiene visitas para la fecha seleccionada.",
    );
  if (stops.length > 25)
    throw new MapsError(
      "Google Maps admite hasta 25 visitas por cálculo. Revisa y divide este recorrido.",
    );
  if (stops.some((s) => !s.address.trim()))
    throw new MapsError(
      "Completa los domicilios de todas las visitas antes de consultar Google Maps.",
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
