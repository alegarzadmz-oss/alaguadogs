import postgres from "postgres";
import type { State } from "@/lib/operations";
import { BUSINESS_KEY, type TeamMember } from "@/lib/team";

let client: ReturnType<typeof postgres> | undefined;
export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw Error("Almacenamiento no configurado.");
  return (client ??= postgres(url, {
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  }));
}

// Parameters remain separate from SQL; none of the SQL text comes from requests.
export function prepare(query: string, values: unknown[] = []) {
  let index = 0;
  const sql = query.replace(/\?/g, () => `$${++index}`);
  if (index !== values.length) throw Error("Número de parámetros incorrecto.");
  return { sql, values };
}
export type Statement = ReturnType<typeof prepare>;
export async function rows<T>(statement: Statement): Promise<T[]> {
  return (await database().unsafe(
    statement.sql,
    statement.values as never[],
  )) as unknown as T[];
}
export async function first<T>(statement: Statement): Promise<T | undefined> {
  return (await rows<T>(statement))[0];
}
export async function run(statement: Statement) {
  const result = await database().unsafe(
    statement.sql,
    statement.values as never[],
  );
  return result.count;
}
export async function guardedWrite(statement: Statement, member: TeamMember) {
  return database().begin(async (tx) => {
    const allowed =
      await tx`SELECT id FROM team_members WHERE id = ${member.id} AND user_id = ${member.userId} AND version = ${member.version} AND status = 'active' FOR SHARE`;
    if (!allowed.length) return 0;
    return (await tx.unsafe(statement.sql, statement.values as never[])).count;
  });
}
export async function auditedWrite(
  statement: Statement,
  actor: string,
  action: string,
  member?: TeamMember,
) {
  return database().begin(async (tx) => {
    if (member) {
      const allowed =
        await tx`SELECT id FROM team_members WHERE id = ${member.id} AND user_id = ${member.userId} AND version = ${member.version} AND status = 'active' AND role = 'admin' FOR SHARE`;
      if (!allowed.length) return 0;
    }
    const result = await tx.unsafe(statement.sql, statement.values as never[]);
    if (result.count)
      await tx`INSERT INTO team_audit (id, at, actor, action) VALUES (${crypto.randomUUID()}, ${new Date().toISOString()}, ${actor}, ${action})`;
    return result.count;
  });
}
export async function readSharedState() {
  const row = await first<{ payload: string; revision: number }>(
    prepare("SELECT payload, revision FROM operation_state WHERE owner = ?", [
      BUSINESS_KEY,
    ]),
  );
  if (!row) throw Error("La migración de datos está pendiente.");
  return { state: JSON.parse(row.payload) as State, revision: row.revision };
}
