import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

export const BACKUP_TABLES = [
  "operation_state",
  "team_members",
  "team_audit",
  "route_visits",
  "service_closeouts",
  "service_photos",
  "service_receipt_shares",
  "service_email_outbox",
  "maps_usage",
  "saved_routes",
] as const;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_STORAGE_BYTES = 1024 * 1024 * 1024;
export type TableName = (typeof BACKUP_TABLES)[number];
export type BackupPhoto = {
  id: string;
  pathname: string;
  object: string;
  md5: string;
  bytes: number;
};
export type BackupSnapshot = {
  format: "alagua-dogs-backup-v1";
  createdAt: string;
  commit: string | null;
  schema: string;
  schemaHash: string;
  tables: Record<
    TableName,
    { columns: string[]; rows: Record<string, unknown>[]; hash: string }
  >;
  photos: BackupPhoto[];
};
export class BackupError extends Error {
  constructor(
    public code: string,
    message = "No se pudo completar el respaldo.",
  ) {
    super(message);
  }
}
export function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}
export const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export const md5 = (value: Buffer) =>
  createHash("md5").update(value).digest("base64");
export const rowsHash = (rows: Record<string, unknown>[]) =>
  sha256(rows.map(canonical).sort().join("\n"));
export function packSnapshot(snapshot: BackupSnapshot) {
  const json = Buffer.from(JSON.stringify(snapshot));
  if (json.length > MAX_BACKUP_BYTES)
    throw new BackupError(
      "snapshot_too_large",
      "El respaldo superó el límite de tamaño configurado.",
    );
  return gzipSync(json);
}
export function readSnapshot(
  bytes: Buffer,
  expectedHash: string,
  trustedSchema: string,
): BackupSnapshot {
  if (bytes.length > MAX_BACKUP_BYTES || sha256(bytes) !== expectedHash)
    throw new BackupError("checksum_mismatch");
  let parsed: BackupSnapshot;
  try {
    parsed = JSON.parse(
      gunzipSync(bytes, { maxOutputLength: MAX_BACKUP_BYTES }).toString("utf8"),
    );
  } catch {
    throw new BackupError("invalid_archive");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    parsed.format !== "alagua-dogs-backup-v1" ||
    parsed.schemaHash !== sha256(trustedSchema) ||
    parsed.schema !== trustedSchema ||
    !Array.isArray(parsed.photos) ||
    parsed.photos.some((p) => !p || typeof p !== "object")
  )
    throw new BackupError("schema_mismatch");
  if (
    Object.keys(parsed.tables || {})
      .sort()
      .join() !== [...BACKUP_TABLES].sort().join()
  )
    throw new BackupError("table_mismatch");
  for (const table of BACKUP_TABLES) {
    const data = parsed.tables[table];
    if (
      !data ||
      !Array.isArray(data.columns) ||
      !data.columns.length ||
      new Set(data.columns).size !== data.columns.length ||
      data.columns.some((c) => !/^[a-z_]+$/.test(c)) ||
      !Array.isArray(data.rows) ||
      data.rows.length > 100000 ||
      data.rows.some(
        (row) =>
          !row ||
          typeof row !== "object" ||
          Array.isArray(row) ||
          Object.keys(row).sort().join() !== [...data.columns].sort().join(),
      ) ||
      rowsHash(data.rows) !== data.hash
    )
      throw new BackupError("rows_mismatch");
  }
  const activePhotos = parsed.tables.service_photos.rows.filter(
    (p) => p.deleted_at === null,
  );
  if (
    new Set(parsed.photos.map((p) => p.id)).size !== parsed.photos.length ||
    activePhotos.length !== parsed.photos.length ||
    activePhotos.some(
      (p) =>
        !parsed.photos.some(
          (file) => file.id === p.id && file.pathname === p.pathname,
        ),
    ) ||
    parsed.photos.some(
      (p) =>
        !/^photos\/[a-f0-9]{64}\.jpg$/.test(p.object) ||
        !Number.isSafeInteger(p.bytes) ||
        p.bytes < 1 ||
        p.bytes > MAX_PHOTO_BYTES ||
        !/^[A-Za-z0-9+/]{22}==$/.test(p.md5),
    )
  )
    throw new BackupError("photos_mismatch");
  return parsed;
}
