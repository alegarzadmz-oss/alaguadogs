import postgres from "postgres";
import { readFile } from "node:fs/promises";
// The backup is a private local file, never a tracked source file.
const path = process.argv[2];
if (!path || !process.env.DATABASE_URL)
  throw Error("Uso: npm run db:import -- /ruta/privada/respaldo.json");
const backup = JSON.parse(await readFile(path, "utf8"));
for (const table of ["operation_state", "team_members", "team_audit"]) {
  if (!Array.isArray(backup[table])) throw Error(`Falta la tabla ${table}.`);
}
const shared = backup.operation_state.find(
  (r) => r.owner === "business:alagua-dogs",
);
if (!shared || !Number.isInteger(shared.revision))
  throw Error("Falta el espacio compartido.");
const state = JSON.parse(shared.payload);
for (const key of [
  "clients",
  "vans",
  "services",
  "appointments",
  "payments",
  "incidents",
  "audit",
  "operations",
]) {
  if (!Array.isArray(state[key])) throw Error(`Respaldo incompleto: ${key}.`);
}
if (
  !backup.team_members.some(
    (m) =>
      m.id === "alagua-administration" &&
      m.role === "admin" &&
      m.status === "active",
  )
)
  throw Error("Falta la administración activa.");
const db = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  await db.begin(async (tx) => {
    // A retry or accidental second import must not overwrite live Vercel records.
    await tx`LOCK TABLE operation_state, team_members, team_audit IN EXCLUSIVE MODE`;
    const [counts] =
      await tx`SELECT (SELECT count(*) FROM operation_state) + (SELECT count(*) FROM team_members) + (SELECT count(*) FROM team_audit) AS total`;
    if (Number(counts.total) !== 0)
      throw Error(
        "El destino ya tiene datos. Se canceló la importación para conservarlos.",
      );
    for (const r of backup.operation_state) {
      JSON.parse(r.payload);
      await tx`INSERT INTO operation_state (owner, payload, revision) VALUES (${r.owner}, ${r.payload}, ${r.revision})`;
    }
    for (const m of backup.team_members) {
      const previouslyBound = Boolean(m.user_id);
      const legacyId = m.user_id ? `sites:${m.user_id}` : null;
      await tx`INSERT INTO team_members (id,email,name,role,van_id,status,user_id,invite_hash,invite_expires,version,created_at,legacy_identity)
        VALUES (${m.id},${m.email.toLowerCase()},${m.name},${m.role},${m.van_id},${m.status},${legacyId},${m.invite_hash},${m.invite_expires},${m.version},${m.created_at},${previouslyBound})`;
    }
    for (const r of backup.team_audit)
      await tx`INSERT INTO team_audit (id,at,actor,action) VALUES (${r.id},${r.at},${r.actor},${r.action})`;
    await tx`INSERT INTO team_audit (id,at,actor,action) VALUES (${crypto.randomUUID()},${new Date().toISOString()},'Migración','Datos importados de Sites. Las cuentas activas se vinculan una vez al correo verificado del nuevo inicio de sesión.')`;
  });
  console.log(
    `Importación completa: revisión ${shared.revision}; ${state.clients.length} clientes, ${state.appointments.length} citas, ${state.payments.length} pagos, ${backup.team_members.length} accesos.`,
  );
} finally {
  await db.end();
}
