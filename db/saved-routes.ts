import { createHash } from "node:crypto";
import { database } from "./store";
import { AccessError, BUSINESS_KEY, type TeamMember } from "@/lib/team";
import type { State } from "@/lib/operations";
import type { RouteVisit } from "@/lib/route-history";
import {
  orderedSource,
  routeSource,
  sourceIdentity,
  SavedRouteError,
  type RouteSource,
  type SavedRoute,
} from "@/lib/saved-routes";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function requireAdmin(m: TeamMember) {
  if (m.role !== "admin" || m.status !== "active")
    throw new AccessError(
      "Solo Administración puede aprobar o guardar propuestas de ruta.",
    );
}
type RecordRow = {
  id: string;
  payload: RouteSource;
  source_hash: string;
  status: SavedRoute["status"];
  created_at: string;
  created_by: string;
  published_at: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  revision: number;
};
function project(
  row: RecordRow,
  state: State,
  history: RouteVisit[],
  staff = false,
): SavedRoute {
  let stale = true;
  try {
    stale =
      hash(
        sourceIdentity(
          routeSource(state, history, row.payload.date, row.payload.vanId),
        ),
      ) !== row.source_hash;
  } catch {}
  // Never send old customer addresses to staff after an assignment/address edit.
  return {
    ...row.payload,
    stops:
      staff && stale
        ? []
        : row.payload.stops.map((stop) => ({
            id: stop.id,
            clientId: stop.clientId,
            client: stop.client,
            address: stop.address,
            ...(stop.time ? { time: stop.time, duration: stop.duration } : {}),
          })),
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    createdBy: staff ? "Administración" : row.created_by,
    publishedAt: row.published_at,
    assignedTo: row.assigned_to,
    assignedName: row.assigned_name,
    revision: row.revision,
    stale,
  };
}

export async function storeRoadProposal(
  member: TeamMember,
  source: RouteSource,
  order: string[],
  owner = BUSINESS_KEY,
) {
  requireAdmin(member);
  return database().begin(async (tx) => {
    const allowed =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='admin' AND status='active' FOR SHARE`;
    if (!allowed.length)
      throw new AccessError("Tu acceso cambió. Actualiza el portal.");
    const [record] =
      await tx`SELECT payload FROM operation_state WHERE owner=${owner} FOR SHARE`;
    if (!record) throw new SavedRouteError("No se pudo leer la agenda.", 503);
    const state = JSON.parse(record.payload) as State;
    const records =
      await tx`SELECT payload FROM route_visits WHERE owner=${owner} ORDER BY id FOR SHARE`;
    const history = records.map((r) => r.payload as RouteVisit);
    const current = routeSource(state, history, source.date, source.vanId);
    if (sourceIdentity(current) !== sourceIdentity(source))
      throw new SavedRouteError(
        "Las visitas cambiaron mientras se calculaba la ruta. Solicita una propuesta actualizada.",
        409,
      );
    const payload = orderedSource(current, order);
    const sourceHash = hash(sourceIdentity(current));
    const dedupe = hash(JSON.stringify([sourceHash, order]));
    const created =
      await tx`INSERT INTO saved_routes (id,owner,service_date,van_id,payload,source_hash,dedupe_key,status,created_at,created_by) VALUES (${crypto.randomUUID()},${owner},${source.date},${source.vanId},${tx.json(payload)},${sourceHash},${dedupe},'draft',${new Date().toISOString()},${member.name}) ON CONFLICT (owner,dedupe_key) DO NOTHING RETURNING *`;
    const row =
      created[0] ||
      (
        await tx`SELECT * FROM saved_routes WHERE owner=${owner} AND dedupe_key=${dedupe}`
      )[0];
    if (created.length)
      await tx`INSERT INTO team_audit(id,at,actor,action) VALUES (${crypto.randomUUID()},${new Date().toISOString()},${member.id},${`Propuesta de ruta guardada: ${source.vanId}, ${source.date}, ${row.id}`})`;
    return project(row as RecordRow, state, history);
  });
}

export async function savedRoutes(
  member: TeamMember,
  from: string,
  to: string,
  vanId: string | null = null,
  owner = BUSINESS_KEY,
) {
  if (member.status !== "active" || !["admin", "groomer"].includes(member.role))
    throw new AccessError("Tu cuenta no tiene acceso a estas rutas.");
  return database().begin(async (tx) => {
    const allowed =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role=${member.role} AND status='active' FOR SHARE`;
    if (!allowed.length)
      throw new AccessError("Tu acceso cambió. Actualiza el portal.");
    const rows =
      member.role === "admin"
        ? await tx`SELECT * FROM saved_routes WHERE owner=${owner} AND service_date>=${from} AND service_date<=${to} AND (${vanId}::text IS NULL OR van_id=${vanId}) ORDER BY service_date DESC,created_at DESC,id LIMIT 201`
        : await tx`SELECT * FROM saved_routes WHERE owner=${owner} AND service_date>=${from} AND service_date<=${to} AND status='active' AND assigned_to=${member.id} AND (${vanId}::text IS NULL OR van_id=${vanId}) ORDER BY service_date,id LIMIT 201`;
    if (rows.length > 200)
      throw new SavedRouteError(
        "Acota las fechas para revisar las propuestas guardadas.",
      );
    const [record] =
      await tx`SELECT payload FROM operation_state WHERE owner=${owner} FOR SHARE`;
    if (!record) throw new SavedRouteError("No se pudo leer la agenda.", 503);
    const state = JSON.parse(record.payload) as State;
    const history = (
      await tx`SELECT payload FROM route_visits WHERE owner=${owner} ORDER BY id FOR SHARE`
    ).map((r) => r.payload as RouteVisit);
    const groomers =
      member.role === "admin"
        ? (
            await tx`SELECT id,name,van_id FROM team_members WHERE role='groomer' AND status='active' ORDER BY name`
          ).map((r) => ({
            id: r.id as string,
            name: r.name as string,
            vanId: r.van_id as string,
          }))
        : [];
    return {
      routes: rows.map((row) =>
        project(row as RecordRow, state, history, member.role === "groomer"),
      ),
      groomers,
      canManage: member.role === "admin",
    };
  });
}

export async function publishRoadRoute(
  member: TeamMember,
  input: { id: string; revision: number; groomerId: string; reviewed: boolean },
  owner = BUSINESS_KEY,
) {
  requireAdmin(member);
  if (!input.reviewed)
    throw new SavedRouteError(
      "Revisa los domicilios y el orden antes de publicar la ruta.",
    );
  return database().begin(async (tx) => {
    const allowed =
      await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='admin' AND status='active' FOR SHARE`;
    if (!allowed.length)
      throw new AccessError("Tu acceso cambió. Actualiza el portal.");
    const [meta] =
      await tx`SELECT service_date::text AS day,van_id FROM saved_routes WHERE owner=${owner} AND id=${input.id}`;
    if (!meta)
      throw new SavedRouteError("La propuesta ya no está disponible.", 404);
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`${owner}:route:${meta.day}:${meta.van_id}`}))`;
    const [record] =
      await tx`SELECT payload FROM operation_state WHERE owner=${owner} FOR SHARE`;
    const state = JSON.parse(record.payload) as State;
    const history = (
      await tx`SELECT payload FROM route_visits WHERE owner=${owner} ORDER BY id FOR SHARE`
    ).map((r) => r.payload as RouteVisit);
    const [row] =
      await tx`SELECT * FROM saved_routes WHERE owner=${owner} AND id=${input.id} FOR UPDATE`;
    if (row.revision !== input.revision)
      throw new SavedRouteError(
        "Otra persona cambió esta propuesta. Actualiza antes de publicar.",
        409,
      );
    const view = project(row as RecordRow, state, history);
    if (view.stale)
      throw new SavedRouteError(
        "Las visitas o domicilios cambiaron. Calcula una propuesta actualizada.",
        409,
      );
    const [groomer] =
      await tx`SELECT id,name FROM team_members WHERE id=${input.groomerId} AND role='groomer' AND status='active' FOR SHARE`;
    if (!groomer)
      throw new SavedRouteError(
        "Selecciona una cuenta activa de bañador en Equipo y servicios.",
      );
    const source = routeSource(state, history, view.date, view.vanId);
    if (source.kind === "appointments") {
      if (source.stops.some((s) => s.groomerId !== input.groomerId))
        throw new SavedRouteError(
          "Asigna primero todas las citas de esta ruta a ese bañador en la agenda.",
        );
      if (
        state.appointments.some(
          (a) =>
            source.stops.some((s) => s.id === a.id) &&
            a.status !== "Confirmado",
        )
      )
        throw new SavedRouteError(
          "Ya hay servicios iniciados o completados. Conserva la ruta del día.",
        );
    }
    if (row.status === "active" && row.assigned_to === groomer.id) return view;
    await tx`UPDATE saved_routes SET status='replaced',revision=revision+1 WHERE owner=${owner} AND service_date=${view.date} AND van_id=${view.vanId} AND status='active' AND id<>${input.id}`;
    const now = new Date().toISOString();
    const [updated] =
      await tx`UPDATE saved_routes SET status='active',assigned_to=${groomer.id},assigned_name=${groomer.name},published_at=${now},revision=revision+1 WHERE owner=${owner} AND id=${input.id} RETURNING *`;
    await tx`INSERT INTO team_audit(id,at,actor,action) VALUES (${crypto.randomUUID()},${now},${member.id},${`Ruta del día publicada: ${view.vanId}, ${view.date}, bañador ${groomer.id}`})`;
    return project(updated as RecordRow, state, history);
  });
}
