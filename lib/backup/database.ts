import { randomUUID } from "node:crypto";
import { database } from "@/db/store";
import { AccessError, type TeamMember } from "@/lib/team";
import {
  BACKUP_TABLES,
  BackupError,
  rowsHash,
  sha256,
  type BackupSnapshot,
  type TableName,
} from "./format";

const identifier = (name: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name))
    throw new BackupError("invalid_identifier");
  return `"${name}"`;
};
export async function exportDatabase(
  schema: string,
  member?: TeamMember,
): Promise<BackupSnapshot> {
  return (await database().begin(
    "isolation level repeatable read read only",
    async (tx) => {
      if (member) {
        const allowed =
          await tx`SELECT id FROM public.team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='admin' AND status='active'`;
        if (!allowed.length)
          throw new AccessError("Tu acceso cambió. Actualiza el portal.");
      }
      const found =
        await tx`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
      const expected = [...BACKUP_TABLES, "backup_runs", "backup_locks"].sort();
      if (
        found
          .map((r) => r.tablename)
          .sort()
          .join() !== expected.join()
      )
        throw new BackupError(
          "unrecognized_schema",
          "Cambió la estructura de datos. Hay que actualizar el respaldo antes de continuar.",
        );
      const tables = {} as BackupSnapshot["tables"];
      for (const name of BACKUP_TABLES) {
        const columns = (
          await tx`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${name} ORDER BY ordinal_position`
        ).map((r) => r.column_name as string);
        const rows = Array.from(
          await tx.unsafe(`SELECT * FROM public.${identifier(name)}`),
        ) as Record<string, unknown>[];
        tables[name] = { columns, rows, hash: rowsHash(rows) };
      }
      return {
        format: "alagua-dogs-backup-v1",
        createdAt: new Date().toISOString(),
        commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
        schema,
        schemaHash: sha256(schema),
        tables,
        photos: [],
      };
    },
  )) as unknown as BackupSnapshot;
}
export async function verifyRestoration(
  snapshot: BackupSnapshot,
  trustedSchema: string,
) {
  if (
    snapshot.schema !== trustedSchema ||
    snapshot.schemaHash !== sha256(trustedSchema)
  )
    throw new BackupError("schema_mismatch");
  const schema = `restore_test_${randomUUID().replaceAll("-", "")}`;
  // This transaction holds one connection and its search_path. All writes target
  // a newly-created test schema; public business tables are never restored over.
  return await database().begin(async (tx) => {
    await tx.unsafe("SET LOCAL client_min_messages TO warning");
    await tx.unsafe(`CREATE SCHEMA ${identifier(schema)}`);
    await tx.unsafe(`SET LOCAL search_path TO ${identifier(schema)}`);
    await tx.unsafe(trustedSchema);
    const counts = {} as Record<TableName, number>;
    for (const name of BACKUP_TABLES) {
      const table = `${identifier(schema)}.${identifier(name)}`;
      const expectedColumns = (
        await tx`SELECT column_name FROM information_schema.columns WHERE table_schema=${schema} AND table_name=${name} ORDER BY ordinal_position`
      ).map((r) => r.column_name as string);
      const data = snapshot.tables[name];
      if (expectedColumns.join() !== data.columns.join())
        throw new BackupError("column_mismatch");
      const columns = data.columns.map(identifier).join(",");
      if (data.rows.length)
        await tx.unsafe(
          `INSERT INTO ${table} (${columns}) SELECT ${columns} FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,
          [tx.json(data.rows as Parameters<typeof tx.json>[0])],
        );
      const restored = Array.from(
        await tx.unsafe(`SELECT * FROM ${table}`),
      ) as Record<string, unknown>[];
      if (
        restored.length !== data.rows.length ||
        rowsHash(restored) !== data.hash
      )
        throw new BackupError("restore_mismatch");
      counts[name] = restored.length;
    }
    const master = snapshot.tables.operation_state.rows.find(
      (r) => r.owner === "business:alagua-dogs",
    );
    const clients = master
      ? JSON.parse(String(master.payload)).clients.length
      : 0;
    await tx.unsafe(`DROP SCHEMA ${identifier(schema)} CASCADE`);
    return {
      verifiedAt: new Date().toISOString(),
      tables: counts,
      clients,
      isolated: true,
    };
  });
}
