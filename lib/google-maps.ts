// Server callers only. Never import this module into a client component.
import { z } from "zod";
import { reserveMapsRequests } from "@/db/maps-usage";
import type { TeamMember } from "./team";
import { MapsError, type MapsService } from "./maps-policy";
import { mapsAddressQuery, type mapsRoutePlan } from "./maps-plan";

export async function mapsFetch(
  member: TeamMember,
  service: MapsService,
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
  reserve: typeof reserveMapsRequests = reserveMapsRequests,
) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key)
    throw new MapsError(
      "La conexión con Google Maps aún no está configurada.",
      503,
    );
  // No other Google request path is permitted; the key is sent only in a header.
  const target = new URL(url);
  if (
    (service === "routes" &&
      url !== "https://routes.googleapis.com/directions/v2:computeRoutes") ||
    (service === "geocoding" &&
      (target.origin !== "https://geocode.googleapis.com" ||
        !target.pathname.startsWith("/v4/geocode/address/")))
  )
    throw new MapsError("Destino de Google Maps no permitido.");
  await reserve(member, service);
  try {
    const headers = new Headers(init.headers);
    headers.set("X-Goog-Api-Key", key);
    const response = await fetcher(url, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new MapsError(
        response.status === 429
          ? "Google Maps alcanzó su cuota. Intenta más tarde."
          : "Google Maps no pudo completar la consulta. Revisa la conexión y los domicilios.",
        response.status === 429 ? 429 : 502,
      );
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof MapsError) throw error;
    // Provider errors may contain addresses or request headers. Never log/return them.
    throw new MapsError(
      "Google Maps no respondió a tiempo. El intento se conserva en el contador mensual.",
      502,
    );
  }
}

const geocodeResult = z.object({
  results: z
    .array(
      z.object({
        formattedAddress: z.string(),
        placeId: z.string(),
        granularity: z.string().optional(),
        location: z.object({ latitude: z.number(), longitude: z.number() }),
      }),
    )
    .default([]),
});
export async function geocodeAddress(member: TeamMember, address: string) {
  if (!address.trim() || address.length > 600)
    throw new MapsError("Completa un domicilio válido.");
  const result = geocodeResult.safeParse(
    await mapsFetch(
      member,
      "geocoding",
      `https://geocode.googleapis.com/v4/geocode/address/${encodeURIComponent(mapsAddressQuery(address))}?languageCode=es&regionCode=MX`,
      {
        headers: {
          "X-Goog-FieldMask":
            "results.formattedAddress,results.placeId,results.location,results.granularity",
        },
      },
    ),
  );
  if (!result.success)
    throw new MapsError(
      "Google Maps devolvió una ubicación que requiere revisión.",
      502,
    );
  // Read-only preview. Never overwrite customer/base coordinates automatically.
  return {
    matches: result.data.results.slice(0, 5),
    attribution: "Google Maps",
    saved: false,
  };
}

const duration = z.string().regex(/^\d+(\.\d+)?s$/);
const routeResult = z.object({
  routes: z.array(
    z.object({
      distanceMeters: z.number().nonnegative().default(0),
      duration,
      optimizedIntermediateWaypointIndex: z.array(z.number().int()).default([]),
      legs: z.array(
        z.object({
          distanceMeters: z.number().nonnegative().default(0),
          duration,
        }),
      ),
    }),
  ),
});
export async function computeMapsRoute(
  member: TeamMember,
  plan: ReturnType<typeof mapsRoutePlan>,
) {
  const raw = await mapsFetch(
    member,
    "routes",
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex,routes.legs.distanceMeters,routes.legs.duration,geocodingResults",
      },
      body: JSON.stringify({
        origin: { address: mapsAddressQuery(plan.base) },
        destination: { address: mapsAddressQuery(plan.base) },
        intermediates: plan.stops.map((s) => ({
          address: mapsAddressQuery(s.address),
        })),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        optimizeWaypointOrder: plan.stops.length > 1,
        languageCode: "es-MX",
        regionCode: "MX",
        units: "METRIC",
      }),
    },
  );
  return parseMapsRouteResponse(raw, plan);
}

export function parseMapsRouteResponse(
  raw: unknown,
  plan: ReturnType<typeof mapsRoutePlan>,
) {
  const geocoding = z
    .object({
      geocodingResults: z
        .object({
          intermediates: z
            .array(
              z.object({
                intermediateWaypointRequestIndex: z
                  .number()
                  .int()
                  .optional()
                  .default(0),
                partialMatch: z.boolean().optional(),
                geocoderStatus: z
                  .object({ code: z.number().optional() })
                  .optional(),
              }),
            )
            .optional()
            .default([]),
        })
        .optional(),
    })
    .safeParse(raw);
  const points = geocoding.success
    ? geocoding.data.geocodingResults?.intermediates || []
    : [];
  const failed = points
    .filter((p) => (p.geocoderStatus?.code || 0) !== 0)
    .map((p) => plan.stops[p.intermediateWaypointRequestIndex])
    .filter(Boolean);
  if (failed.length)
    throw new MapsError(
      `Google Maps no ubicó estos domicilios: ${failed.map((s) => `${s.client} (${s.address})`).join("; ")}. Revisa el domicilio o pin antes de calcular el recorrido.`,
      422,
    );
  const locationWarnings = points
    .filter((p) => p.partialMatch)
    .map((p) => plan.stops[p.intermediateWaypointRequestIndex])
    .filter(Boolean)
    .map((s) => ({
      id: s.id,
      client: s.client,
      address: s.address,
      reason:
        "Google reconoció parcialmente el domicilio; verifica el punto de acceso.",
    }));
  const parsed = routeResult.safeParse(raw);
  const route = parsed.success ? parsed.data.routes[0] : undefined;
  // One stop has only one possible order. Google can return a -1 sentinel for
  // optimization with one intermediate; do not treat it as an array index.
  const order =
    plan.stops.length === 1
      ? [0]
      : route?.optimizedIntermediateWaypointIndex || [];
  if (
    !route ||
    order.length !== plan.stops.length ||
    new Set(order).size !== order.length ||
    order.some((i) => i < 0 || i >= plan.stops.length) ||
    route.legs.length !== plan.stops.length + 1
  )
    throw new MapsError(
      "Google Maps no devolvió todas las paradas. Revisa los domicilios.",
      502,
    );
  const minutes = (v: string) => Math.ceil(Number(v.slice(0, -1)) / 60);
  return {
    ...plan,
    stops: order.map((i, n) => ({
      ...plan.stops[i],
      travelMinutes: minutes(route.legs[n].duration),
    })),
    distanceKm: Math.round(route.distanceMeters / 100) / 10,
    drivingMinutes: minutes(route.duration),
    returnMinutes: minutes(route.legs.at(-1)!.duration),
    saved: false,
    attribution: "Google Maps",
    locationWarnings,
    warning:
      "Consulta de recorrido por calles, sin tráfico en vivo. Incluye salida y regreso a base. Verifica las ubicaciones; no cambia citas, horarios, clientes ni pagos. No garantiza el óptimo global." +
      (locationWarnings.length
        ? ` Ubicaciones por verificar: ${locationWarnings.map((s) => s.client).join(", ")}.`
        : ""),
  };
}
