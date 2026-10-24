import { database } from "./store";
import { AccessError, BUSINESS_KEY, type TeamMember } from "@/lib/team";
import {
  MAPS_MONTHLY_LIMIT,
  MAPS_SERVICES,
  MapsError,
  mapsMonth,
  mapsReservation,
  type MapsService,
} from "@/lib/maps-policy";

function requireAdmin(member: TeamMember) {
  if (member.role !== "admin" || member.status !== "active")
    throw new AccessError("Google Maps requiere acceso de administración.");
}

export async function readMapsUsage(
  member: TeamMember,
  owner = BUSINESS_KEY,
  now = new Date(),
) {
  requireAdmin(member);
  const month = mapsMonth(now);
  const records =
    await database()`SELECT service, used FROM maps_usage WHERE owner=${owner} AND month=${month}`;
  return {
    month,
    timeZone: "America/Monterrey",
    sharedVans: 4,
    services: Object.fromEntries(
      MAPS_SERVICES.map((service) => {
        const used = Number(
          records.find((r) => r.service === service)?.used || 0,
        );
        return [
          service,
          {
            used,
            limit: MAPS_MONTHLY_LIMIT,
            remaining: Math.max(0, MAPS_MONTHLY_LIMIT - used),
          },
        ];
      }),
    ) as Record<
      MapsService,
      { used: number; limit: number; remaining: number }
    >,
  };
}

// Reserve before HTTP, not after. The conditional UPSERT serializes competing
// requests across all functions/vans. Failed and timed-out HTTP calls stay counted.
export async function reserveMapsRequests(
  member: TeamMember,
  service: MapsService,
  amount = 1,
  owner = BUSINESS_KEY,
  now = new Date(),
) {
  requireAdmin(member);
  mapsReservation(service, amount);
  const month = mapsMonth(now);
  await database().begin(async (tx) => {
    const allowed =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='admin' AND status='active' FOR SHARE`;
    if (!allowed.length)
      throw new AccessError("Tu acceso cambió. Actualiza el portal.");
    const result =
      await tx`INSERT INTO maps_usage (owner,month,service,used) VALUES (${owner},${month},${service},${amount}) ON CONFLICT (owner,month,service) DO UPDATE SET used=maps_usage.used+EXCLUDED.used WHERE maps_usage.used <= ${MAPS_MONTHLY_LIMIT - amount} RETURNING used`;
    if (!result.length)
      throw new MapsError(
        `Se alcanzó el límite mensual compartido de ${MAPS_MONTHLY_LIMIT} consultas de ${service === "routes" ? "rutas" : "domicilios"}. Se reanudará el primer día del próximo mes.`,
        429,
      );
    await tx`INSERT INTO team_audit (id,at,actor,action) VALUES (${crypto.randomUUID()},${now.toISOString()},${member.id},${`Google Maps: ${service}, ${amount} consulta(s), ${month}`})`;
  });
}
