export const MAPS_MONTHLY_LIMIT = 1000;
export const MAPS_SERVICES = ["routes", "geocoding"] as const;
export type MapsService = (typeof MAPS_SERVICES)[number];
export class MapsError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function mapsMonth(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Monterrey",
    year: "numeric",
    month: "2-digit",
  })
    .format(now)
    .slice(0, 7);
}
export function mapsReservation(service: MapsService, amount: number) {
  if (
    !MAPS_SERVICES.includes(service) ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > MAPS_MONTHLY_LIMIT
  )
    throw new MapsError("Consulta de Google Maps inválida.");
}
