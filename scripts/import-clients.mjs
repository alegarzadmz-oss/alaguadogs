import postgres from "postgres";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { validateClient } from "../lib/operations.ts";

// Input and backups contain customer data and must stay outside version control.
// Run with Node --env-file=<private production env> --import tsx.
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
for (const flag of ["--input", "--original-demo", "--revision", "--backup"])
  if (!args.includes(flag) || !value(flag) || value(flag).startsWith("--"))
    throw Error(`Falta ${flag}.`);
if (!process.env.DATABASE_URL) throw Error("Falta DATABASE_URL.");
const input = JSON.parse(await readFile(value("--input"), "utf8"));
const original = JSON.parse(await readFile(value("--original-demo"), "utf8"));
const expectedRevision = Number(value("--revision"));
assert(Number.isInteger(expectedRevision) && expectedRevision >= 0);
assert(/^[a-f0-9]{64}$/.test(input.sourceSha256));
assert(input.clients.length > 0 && input.clients.length === input.sourceRows);
const clients = input.clients.map(validateClient);
assert.equal(new Set(clients.map((c) => c.id)).size, clients.length);
const key = (c) =>
  [c.name, c.address]
    .map((v) =>
      v
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    )
    .join("|");
assert.equal(new Set(clients.map(key)).size, clients.length);
const originalRow = original.operation_state.find(
  (r) => r.owner === "business:alagua-dogs",
);
assert(originalRow && JSON.parse(originalRow.payload).demo === true);
const operationId = `clients-xlsx:${input.sourceSha256}`;
const db = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
try {
  await db.begin(async (tx) => {
    const [row] =
      await tx`SELECT owner,payload,revision FROM operation_state WHERE owner='business:alagua-dogs' FOR UPDATE`;
    const before = JSON.parse(row.payload);
    if (before.operations.includes(operationId)) {
      console.log(
        JSON.stringify({ status: "already-imported", revision: row.revision }),
      );
      return;
    }
    assert.equal(
      row.revision,
      expectedRevision,
      "La revisión cambió. No se modificó ningún dato.",
    );
    // Never remove real records merely because the demo flag is still enabled.
    assert(
      isDeepStrictEqual(before, JSON.parse(originalRow.payload)),
      "El portal ya cambió respecto a los ejemplos originales. Revisar antes de importar.",
    );
    const after = structuredClone(before);
    after.clients = clients;
    after.appointments = [];
    after.payments = [];
    after.incidents = [];
    after.demo = false;
    after.operations = [...after.operations, operationId].slice(-1000);
    after.audit.unshift({
      at: new Date().toISOString(),
      actor: "Importación de clientes solicitada en Codex",
      action: `${clients.length} fichas importadas de Excel. Se retiraron únicamente los datos de demostración verificados.`,
    });
    const payload = JSON.stringify(after);
    assert(payload.length < 1800000, "La base supera el límite del portal.");
    const summary = {
      status: args.includes("--apply") ? "imported" : "dry-run",
      sourceRows: input.sourceRows,
      clients: clients.length,
      pets: clients.reduce((n, c) => n + c.pets.length, 0),
      speciesPending: clients
        .flatMap((c) => c.pets)
        .filter((p) => p.species === "Por confirmar").length,
      removedDemoClients: before.clients.length,
      revision: row.revision + 1,
      bytes: Buffer.byteLength(payload),
    };
    if (args.includes("--apply")) {
      // Exclusive creation prevents overwriting an earlier recovery snapshot.
      await writeFile(
        value("--backup"),
        JSON.stringify({ operation_state: [row] }),
        { mode: 0o600, flag: "wx" },
      );
      const changed =
        await tx`UPDATE operation_state SET payload=${payload},revision=revision+1 WHERE owner=${row.owner} AND revision=${expectedRevision}`;
      assert.equal(changed.count, 1);
      const [saved] =
        await tx`SELECT payload,revision FROM operation_state WHERE owner=${row.owner}`;
      assert.equal(saved.payload, payload);
      assert.equal(saved.revision, expectedRevision + 1);
      summary.payloadSha256 = createHash("sha256")
        .update(payload)
        .digest("hex");
    }
    console.log(JSON.stringify(summary));
  });
} finally {
  await db.end();
}
