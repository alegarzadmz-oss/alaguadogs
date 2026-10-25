// Live read-only business snapshot; writes are isolated test schemas and tagged
// backup metadata only. No emails are sent and no cloud objects are created.
import assert from "node:assert/strict";
import { database } from "../db/store.ts";
import { performBackup } from "../lib/backup/run.ts";
import { BackupError, md5 } from "../lib/backup/format.ts";
import { AccessError } from "../lib/team.ts";
const db = database(),
  prefix = "test:" + crypto.randomUUID();
class MemoryStorage {
  files = new Map();
  writes = 0;
  async listPhotos() {
    return [...this.files.entries()]
      .filter(([name]) => name.startsWith("photos/"))
      .map(([name, bytes]) => ({
        name,
        size: bytes.length,
        md5: md5(bytes),
        generation: "1",
      }));
  }
  async put(name, bytes) {
    if (this.files.has(name)) throw Error("Must never overwrite");
    this.writes++;
    this.files.set(name, Buffer.from(bytes));
    return { name, size: bytes.length, md5: md5(bytes), generation: "1" };
  }
  async get(name) {
    return Buffer.from(this.files.get(name));
  }
  async metadata(name) {
    const bytes = this.files.get(name);
    return bytes
      ? { name, size: bytes.length, md5: md5(bytes), generation: "1" }
      : null;
  }
}
try {
  const before = JSON.stringify(
    await db`SELECT * FROM operation_state ORDER BY owner`,
  );
  const storage = new MemoryStorage();
  const result = await performBackup({
    scheduleKey: prefix + ":success",
    storage,
  });
  assert.equal(result.verification.isolated, true);
  assert.ok(result.verification.clients > 0);
  const writes = storage.writes;
  assert.equal(
    (await performBackup({ scheduleKey: prefix + ":success", storage }))
      .alreadyDone,
    true,
  );
  assert.equal(storage.writes, writes);
  const broken = new MemoryStorage();
  broken.get = async () => Buffer.from("not the backup");
  await assert.rejects(
    performBackup({ scheduleKey: prefix + ":bad-storage", storage: broken }),
    (e) => e instanceof BackupError && e.code === "checksum_mismatch",
  );
  const failed =
    await db`SELECT status,error_code FROM backup_runs WHERE schedule_key=${prefix + ":bad-storage"}`;
  assert.equal(failed[0].status, "failed");
  assert.equal(failed[0].error_code, "checksum_mismatch");
  await assert.rejects(
    performBackup({
      scheduleKey: prefix + ":denied",
      storage,
      member: {
        id: prefix,
        userId: prefix,
        role: "admin",
        status: "active",
        version: 0,
        name: "fake",
        email: "fake@example.test",
        vanId: "",
      },
    }),
    AccessError,
  );
  const lockOwner = "business:alagua-dogs";
  await db`INSERT INTO backup_locks(owner,run_id,expires_at) VALUES(${lockOwner},${prefix},now()+interval '1 minute')`;
  await assert.rejects(
    performBackup({ scheduleKey: prefix + ":locked", storage }),
    (e) => e.code === "already_running",
  );
  await db`DELETE FROM backup_locks WHERE owner=${lockOwner} AND run_id=${prefix}`;
  assert.equal(
    JSON.stringify(await db`SELECT * FROM operation_state ORDER BY owner`),
    before,
  );
  assert.equal(
    (
      await db`SELECT nspname FROM pg_namespace WHERE nspname LIKE 'restore_test_%'`
    ).length,
    0,
  );
  console.log(
    JSON.stringify({
      verified: true,
      clients: result.verification.clients,
      photos: result.photos,
      tables: result.verification.tables,
      checks: [
        "downloaded archive and photos",
        "full isolated restore",
        "idempotent retry",
        "checksum failure is not success",
        "revoked or unknown admin rejected",
        "concurrent backup blocked",
        "business unchanged",
        "temporary schemas removed",
      ],
    }),
  );
} finally {
  await db`DELETE FROM backup_runs WHERE schedule_key LIKE ${prefix + "%"}`;
  await db`DELETE FROM backup_locks WHERE run_id=${prefix}`;
  await db.end();
}
