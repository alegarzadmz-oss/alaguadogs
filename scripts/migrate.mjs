import postgres from "postgres";
import { readFile } from "node:fs/promises";
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL no configurada.");
const db = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
const awaitSchema = await readFile(
  new URL("./schema.sql", import.meta.url),
  "utf8",
);
try {
  await db.begin((tx) => tx.unsafe(awaitSchema));
  console.log(
    "Esquema de AL’AGUA DOGS actualizado. No se modificaron registros existentes.",
  );
} finally {
  await db.end();
}
