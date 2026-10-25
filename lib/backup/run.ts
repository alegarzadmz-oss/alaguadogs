import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { get } from "@vercel/blob";
import { database } from "@/db/store";
import { AccessError, BUSINESS_KEY, type TeamMember } from "@/lib/team";
import { exportDatabase, verifyRestoration } from "./database";
import {
  BackupError,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_STORAGE_BYTES,
  md5,
  packSnapshot,
  readSnapshot,
  sha256,
} from "./format";
import {
  backupConfig,
  cloudBackupStorage,
  type BackupStorage,
} from "./storage";

const OWNER = BUSINESS_KEY;
async function schemaSource() {
  return readFile(join(process.cwd(), "scripts/schema.sql"), "utf8");
}
export async function backupStatus() {
  const raw =
    await database()`SELECT id,started_at,completed_at,status,bytes,photo_count,verification,error_code FROM backup_runs WHERE owner=${OWNER} ORDER BY started_at DESC LIMIT 10`;
  const runs = raw.map((run) =>
    run.status === "running" &&
    Date.now() - Date.parse(run.started_at) > 7 * 60000
      ? { ...run, status: "failed", error_code: "interrupted" }
      : run,
  );
  const success = runs.find((run) => run.status === "succeeded");
  return {
    configured: !!backupConfig(),
    schedule: "Diario a las 04:00, hora de Monterrey",
    retentionDays: 30,
    photoStorageLimitMB: 1024,
    overdue:
      !!success?.completed_at &&
      Date.now() - Date.parse(success.completed_at) > 36 * 3600000,
    runs,
  };
}
async function claim(scheduleKey: string, member?: TeamMember) {
  return await database().begin(async (tx) => {
    if (member) {
      const allowed =
        await tx`SELECT id FROM team_members WHERE id=${member.id} AND user_id=${member.userId} AND version=${member.version} AND role='admin' AND status='active' FOR SHARE`;
      if (!allowed.length)
        throw new AccessError("Tu acceso cambió. Actualiza el portal.");
    }
    const [done] =
      await tx`SELECT id FROM backup_runs WHERE owner=${OWNER} AND schedule_key=${scheduleKey} AND status='succeeded'`;
    if (done) return { id: done.id as string, alreadyDone: true };
    const id = crypto.randomUUID();
    const lock =
      await tx`INSERT INTO backup_locks(owner,run_id,expires_at) VALUES(${OWNER},${id},now()+interval '7 minutes') ON CONFLICT(owner) DO UPDATE SET run_id=excluded.run_id,expires_at=excluded.expires_at WHERE backup_locks.expires_at<now() RETURNING owner`;
    if (!lock.length)
      throw new BackupError(
        "already_running",
        "Ya hay un respaldo en curso. Espera unos minutos y actualiza.",
      );
    if (scheduleKey.startsWith("manual:")) {
      const [usage] =
        await tx`SELECT coalesce(sum(attempts),0)::int AS used FROM backup_runs WHERE owner=${OWNER} AND schedule_key LIKE 'manual:%' AND (started_at::timestamptz AT TIME ZONE 'America/Monterrey')::date=(now() AT TIME ZONE 'America/Monterrey')::date`;
      if (usage.used >= 3)
        throw new BackupError(
          "manual_daily_limit",
          "Ya se hicieron tres intentos manuales hoy. El respaldo diario seguirá programado.",
        );
    }
    await tx`UPDATE backup_runs SET status='failed',completed_at=${new Date().toISOString()},error_code='interrupted' WHERE owner=${OWNER} AND status='running'`;
    const [run] =
      await tx`INSERT INTO backup_runs(id,owner,schedule_key,started_at,status) VALUES(${id},${OWNER},${scheduleKey},${new Date().toISOString()},'running') ON CONFLICT(owner,schedule_key) DO UPDATE SET started_at=excluded.started_at,completed_at=NULL,status='running',attempts=backup_runs.attempts+1,error_code=NULL RETURNING id`;
    return { id: run.id as string, lockId: id, alreadyDone: false };
  });
}
async function photoBytes(pathname: string) {
  if (!pathname.startsWith("service-photos/"))
    throw new BackupError("invalid_photo_path");
  const photo = await get(pathname, { access: "private", useCache: false });
  if (!photo || photo.statusCode !== 200)
    throw new BackupError("source_photo_missing");
  const reader = photo.stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_BYTES) throw new BackupError("photo_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export async function performBackup({
  scheduleKey,
  member,
  storage,
}: {
  scheduleKey: string;
  member?: TeamMember;
  storage?: BackupStorage;
}) {
  if (!backupConfig() && !storage)
    throw new BackupError(
      "not_configured",
      "Falta conectar el almacenamiento privado de Google Cloud.",
    );
  const claimed = await claim(scheduleKey, member);
  if (claimed.alreadyDone) return { id: claimed.id, alreadyDone: true };
  try {
    const trustedSchema = await schemaSource();
    const snapshot = await exportDatabase(trustedSchema, member);
    const cloud = storage || (await cloudBackupStorage());
    const existing = await cloud.listPhotos();
    let storedBytes = existing.reduce((total, file) => total + file.size, 0);
    const byName = new Map(existing.map((p) => [p.name, p]));
    const photos = snapshot.tables.service_photos.rows.filter(
      (p) => p.deleted_at === null,
    );
    for (const p of photos) {
      const pathname = String(p.pathname),
        name = `photos/${sha256(pathname)}.jpg`;
      let saved = byName.get(name);
      if (!saved) {
        const bytes = await photoBytes(pathname);
        if (storedBytes + bytes.length > MAX_PHOTO_STORAGE_BYTES)
          throw new BackupError(
            "photo_storage_limit",
            "El archivo de fotos alcanzó su límite de 1 GB. Administración debe revisar la capacidad.",
          );
        saved = await cloud.put(name, bytes, "image/jpeg");
        storedBytes += bytes.length;
        if (saved.md5 !== md5(bytes))
          throw new BackupError("photo_checksum_mismatch");
      }
      snapshot.photos.push({
        id: String(p.id),
        pathname,
        object: name,
        bytes: saved.size,
        md5: saved.md5,
      });
    }
    const archive = packSnapshot(snapshot),
      checksum = sha256(archive);
    const stem = `${snapshot.createdAt.replace(/[:.]/g, "-")}-${claimed.id}`;
    const object = `database/${stem}.json.gz`;
    await cloud.put(object, archive, "application/gzip");
    const downloaded = readSnapshot(
      await cloud.get(object),
      checksum,
      trustedSchema,
    );
    for (const photo of downloaded.photos) {
      const bytes = await cloud.get(photo.object);
      if (bytes.length !== photo.bytes || md5(bytes) !== photo.md5)
        throw new BackupError("photo_restore_mismatch");
    }
    const verification = await verifyRestoration(downloaded, trustedSchema);
    const report = {
      format: "alagua-backup-verification-v1",
      object,
      checksum,
      bytes: archive.length,
      photos: downloaded.photos.length,
      ...verification,
    };
    await cloud.put(
      `reports/${stem}.json`,
      Buffer.from(JSON.stringify(report)),
      "application/json",
    );
    await database()`UPDATE backup_runs SET status='succeeded',completed_at=${new Date().toISOString()},object_name=${object},checksum=${checksum},bytes=${archive.length},photo_count=${downloaded.photos.length},verification=${database().json(verification)} WHERE id=${claimed.id}`;
    return {
      id: claimed.id,
      alreadyDone: false,
      bytes: archive.length,
      photos: downloaded.photos.length,
      verification,
    };
  } catch (e) {
    const code = e instanceof BackupError ? e.code : "backup_failed";
    await database()`UPDATE backup_runs SET status='failed',completed_at=${new Date().toISOString()},error_code=${code} WHERE id=${claimed.id}`;
    if (e instanceof BackupError || e instanceof AccessError) throw e;
    throw new BackupError("backup_failed");
  } finally {
    await database()`DELETE FROM backup_locks WHERE owner=${OWNER} AND run_id=${claimed.lockId!}`;
  }
}
