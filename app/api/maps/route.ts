import { z } from "zod";
import { getPortalUser } from "@/lib/auth";
import { memberFor } from "@/db/team";
import { readSharedState } from "@/db/store";
import { readHistory } from "@/db/route-history";
import { readMapsUsage } from "@/db/maps-usage";
import { AccessError, type TeamMember } from "@/lib/team";
import { MapsError } from "@/lib/maps-policy";
import { geocodeAddress } from "@/lib/google-maps";
import { proposeRoadRoute } from "@/lib/road-proposal";
import { SavedRouteError } from "@/lib/saved-routes";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function admin() {
  const user = await getPortalUser();
  if (!user)
    throw new MapsError("Inicia sesión para consultar Google Maps.", 401);
  const member = await memberFor(user);
  if (member.role !== "admin" || member.status !== "active")
    throw new AccessError("Google Maps requiere acceso de administración.");
  return member;
}
async function usage(member: TeamMember) {
  return {
    ...(await readMapsUsage(member)),
    connected: !!process.env.GOOGLE_MAPS_API_KEY,
    budget: {
      currency: "MXN",
      amount: 170,
      thresholds: [50, 80, 100],
      mode: "alert-only",
    },
  };
}
function failure(e: unknown) {
  if (e instanceof AccessError) return json({ error: e.message }, 403);
  if (e instanceof MapsError) return json({ error: e.message }, e.status);
  if (e instanceof SavedRouteError) return json({ error: e.message }, e.status);
  return json(
    { error: "No se pudo consultar Google Maps. Intenta de nuevo." },
    503,
  );
}
export async function GET() {
  try {
    return json(await usage(await admin()));
  } catch (e) {
    return failure(e);
  }
}
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("route"),
      date: z.string(),
      vanId: z.string().max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("geocode"),
      target: z.enum(["base", "client"]),
      clientId: z.string().max(100).optional(),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      throw new MapsError("Origen no permitido.", 403);
    const member = await admin();
    const raw = await request.text();
    if (raw.length > 3000)
      throw new MapsError("Solicitud demasiado grande.", 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new MapsError("Solicitud inválida.");
    }
    const parsed = input.safeParse(body);
    if (!parsed.success)
      throw new MapsError("Revisa la fecha, camioneta o ficha seleccionada.");
    const { state } = await readSharedState();
    const value = parsed.data;
    let result: unknown;
    if (value.action === "route") {
      result = await proposeRoadRoute(
        member,
        { state, history: await readHistory(member) },
        value.date,
        value.vanId,
      );
    } else {
      const address =
        value.target === "base"
          ? state.base.address
          : state.clients.find((c) => c.id === value.clientId)?.address;
      if (!address)
        throw new MapsError(
          "Completa primero el domicilio en la ficha o configuración de base.",
        );
      result = await geocodeAddress(member, address);
    }
    return json({ result, usage: await usage(member) });
  } catch (e) {
    return failure(e);
  }
}
