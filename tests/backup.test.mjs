import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import {
  BACKUP_TABLES,
  BackupError,
  canonical,
  md5,
  packSnapshot,
  readSnapshot,
  rowsHash,
  sha256,
} from "../lib/backup/format.ts";
function fixture() {
  const schema = "CREATE TABLE example (id text);";
  return {
    format: "alagua-dogs-backup-v1",
    createdAt: "2026-10-24T10:00:00Z",
    commit: null,
    schema,
    schemaHash: sha256(schema),
    tables: Object.fromEntries(
      BACKUP_TABLES.map((name) => [
        name,
        { columns: ["id"], rows: [], hash: rowsHash([]) },
      ]),
    ),
    photos: [],
  };
}
function read(s) {
  const archive = packSnapshot(s);
  return readSnapshot(archive, sha256(archive), s.schema);
}
test("backup round-trip retains private rows and JSON payloads without relying on row/property order", () => {
  const s = fixture();
  s.tables.team_audit = {
    columns: ["id", "action"],
    rows: [
      { id: "1", action: "Texto con ' ; DROP SCHEMA public CASCADE; --" },
      { id: "2", action: "Sin cambios" },
    ],
    hash: "",
  };
  s.tables.team_audit.hash = rowsHash(s.tables.team_audit.rows);
  assert.deepEqual(read(s), s);
  assert.equal(
    rowsHash([{ a: 1, b: { z: 2, y: 3 } }, { a: 2 }]),
    rowsHash([{ a: 2 }, { b: { y: 3, z: 2 }, a: 1 }]),
  );
  assert.equal(
    canonical({ date: new Date("2026-10-24Z") }),
    canonical({ date: "2026-10-24T00:00:00.000Z" }),
  );
});
test("a corrupted or substituted archive is rejected before any restore", () => {
  const s = fixture(),
    archive = packSnapshot(s);
  assert.throws(
    () =>
      readSnapshot(
        Buffer.concat([archive, Buffer.from("x")]),
        sha256(archive),
        s.schema,
      ),
    (e) => e instanceof BackupError && e.code === "checksum_mismatch",
  );
  assert.throws(
    () => readSnapshot(archive, sha256(archive), "different schema"),
    (e) => e.code === "schema_mismatch",
  );
});
test("an omitted table, mismatching row checksum or unexpected column cannot silently pass", () => {
  const s = fixture();
  delete s.tables.team_members;
  assert.throws(
    () => read(s),
    (e) => e.code === "table_mismatch",
  );
  const t = fixture();
  t.tables.team_audit.rows.push({ id: "x" });
  assert.throws(
    () => read(t),
    (e) => e.code === "rows_mismatch",
  );
  const u = fixture();
  u.tables.team_audit.columns = ["id); DROP"];
  assert.throws(
    () => read(u),
    (e) => e.code === "rows_mismatch",
  );
});
test("active photo references must have a complete manifest with safe object names and checksums", () => {
  const s = fixture(),
    bytes = Buffer.from("photo bytes");
  const row = {
    id: "p1",
    pathname: "service-photos/example.jpg",
    deleted_at: null,
  };
  s.tables.service_photos = {
    columns: Object.keys(row),
    rows: [row],
    hash: rowsHash([row]),
  };
  assert.throws(
    () => read(s),
    (e) => e.code === "photos_mismatch",
  );
  s.photos.push({
    id: row.id,
    pathname: row.pathname,
    object: "photos/" + sha256(row.pathname) + ".jpg",
    bytes: bytes.length,
    md5: md5(bytes),
  });
  assert.equal(read(s).photos.length, 1);
  s.photos[0].object = "../../private-file";
  assert.throws(
    () => read(s),
    (e) => e.code === "photos_mismatch",
  );
});
test("invalid JSON archives and primitive values fail with a controlled error", () => {
  for (const text of ["not-json", "null", "[]"]) {
    const bytes = gzipSync(text);
    assert.throws(
      () => readSnapshot(bytes, sha256(bytes), "schema"),
      (e) => e instanceof BackupError,
    );
  }
});
