import fs from "node:fs/promises";
import path from "node:path";
import { database } from "../db/store";
import { readSnapshot, md5 } from "../lib/backup/format";
import { verifyRestoration } from "../lib/backup/database";
const [archiveFile, checksum, photoDirectory] = process.argv.slice(2);
if (!archiveFile || !/^[a-f0-9]{64}$/.test(checksum || ""))
  throw Error(
    "Uso: node --env-file=.env.local --import tsx scripts/verify-backup.mts archivo.json.gz SHA256 carpeta-descargada",
  );
const db = database();
try {
  const schema = await fs.readFile("scripts/schema.sql", "utf8");
  const snapshot = readSnapshot(
    await fs.readFile(archiveFile),
    checksum,
    schema,
  );
  for (const photo of snapshot.photos) {
    if (!photoDirectory)
      throw Error("Falta la carpeta con las fotos descargadas del respaldo.");
    const bytes = await fs.readFile(path.join(photoDirectory, photo.object));
    if (bytes.length !== photo.bytes || md5(bytes) !== photo.md5)
      throw Error("Una foto no coincide con el respaldo.");
  }
  console.log(
    JSON.stringify(
      {
        ...(await verifyRestoration(snapshot, schema)),
        photos: snapshot.photos.length,
      },
      null,
      2,
    ),
  );
} finally {
  await db.end();
}
