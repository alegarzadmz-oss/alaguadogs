// Explicit integration run only. All records use a disposable owner and fake identities;
// no route, account or customer of business:alagua-dogs is edited.
import assert from "node:assert/strict";
import { database } from "../db/store.ts";
import { importRoutes, manageRoute } from "../db/route-capture.ts";
import { readHistory, updateHistory } from "../db/route-history.ts";
import { demoState } from "../lib/operations.ts";
import { parseRouteText, toCaptureInput } from "../lib/route-capture.ts";
import { boardVisits, summarizeVisits } from "../lib/route-history.ts";
import { AccessError } from "../lib/team.ts";
const db = database(),
  prefix = `guide-test-${crypto.randomUUID()}`,
  owner = `test:${prefix}`;
const admin = {
  id: prefix,
  name: prefix + " admin",
  email: prefix + "@example.test",
  userId: `clerk:${prefix}`,
  role: "admin",
  status: "active",
  version: 0,
  vanId: "",
};
const reception = {
  ...admin,
  id: prefix + "-r",
  name: prefix + " reception",
  email: prefix + "-r@example.test",
  userId: `clerk:${prefix}-r`,
  role: "reception",
};
const state = { ...demoState(), appointments: [], payments: [], incidents: [] };
const initialPayload = JSON.stringify(state);
let checks = 0;
const check = (value) => {
  assert.ok(value);
  checks++;
};
async function rejects(promise, expected) {
  await assert.rejects(promise, expected);
  checks++;
}
try {
  for (const m of [admin, reception])
    await db`INSERT INTO team_members(id,email,name,role,status,user_id,created_at) VALUES (${m.id},${m.email},${m.name},${m.role},'active',${m.userId},${new Date().toISOString()})`;
  await db`INSERT INTO operation_state(owner,payload,revision) VALUES (${owner},${initialPayload},0)`;
  const text =
    "VAN C\nCliente Ejemplo\nCalle Ejemplo 123\nLuna — bichón — baño\nMax — criollo — corte\n4 cortes de uñas adicionales\nObservación: avisar\n\nVAN D\nOtra Clienta\nCalle 456\nToby — poodle — baño\nPrecio: $450\nPago: Efectivo";
  const input = {
    operationId: crypto.randomUUID(),
    sourceText: text,
    rows: parseRouteText(text, "2030-01-07", "v1", state).map((v) => ({
      visit: toCaptureInput(v),
      duplicateConfirmed: false,
    })),
  };
  const created = await importRoutes(admin, input, owner);
  check(created.length === 2);
  check(created[0].price === null && created[0].method === "Pendiente");
  check(summarizeVisits(boardVisits(state, created)).pets === 3);
  check(summarizeVisits(boardVisits(state, created)).additional === 4);
  const repeated = await importRoutes(admin, input, owner);
  check(repeated[0].id === created[0].id);
  check((await readHistory(admin, owner)).length === 2);
  await rejects(
    importRoutes(admin, { ...input, operationId: crypto.randomUUID() }, owner),
    /duplicado/,
  );
  check((await readHistory(admin, owner)).length === 2);
  await rejects(importRoutes(reception, input, owner), AccessError);
  await rejects(
    manageRoute(
      reception,
      {
        action: "archive",
        id: created[0].id,
        revision: 0,
        confirmReceived: true,
      },
      owner,
    ),
    AccessError,
  );
  const paid = await updateHistory(
    admin,
    created[0].id,
    0,
    {
      price: 65000,
      method: "Transferencia",
      received: false,
      clientId: null,
      vanId: "v3",
    },
    owner,
  );
  check(paid.received === false);
  const confirmed = await updateHistory(
    reception,
    paid.id,
    paid.revision,
    { received: true },
    owner,
  );
  check(
    confirmed.received === true &&
      confirmed.confirmedBy === reception.name &&
      !!confirmed.confirmedAt,
  );
  check(
    confirmed.notes === undefined &&
      confirmed.source === "Registro de transferencias",
  );
  await rejects(
    updateHistory(
      reception,
      confirmed.id,
      confirmed.revision,
      { received: false, price: 1 },
      owner,
    ),
    AccessError,
  );
  await rejects(
    updateHistory(reception, created[1].id, 0, { received: true }, owner),
    AccessError,
  );
  check((await readHistory(reception, owner)).length === 1);
  const concurrent = await Promise.allSettled([
    updateHistory(
      reception,
      confirmed.id,
      confirmed.revision,
      { received: false },
      owner,
    ),
    updateHistory(
      reception,
      confirmed.id,
      confirmed.revision,
      { received: true },
      owner,
    ),
  ]);
  check(concurrent.filter((r) => r.status === "fulfilled").length === 1);
  check(concurrent.filter((r) => r.status === "rejected").length === 1);
  let current = (await readHistory(admin, owner)).find((v) => v.id === paid.id);
  const edited = await manageRoute(
    admin,
    {
      action: "details",
      id: current.id,
      revision: current.revision,
      visit: {
        ...toCaptureInput(current),
        vanId: "v4",
        date: "2030-01-08",
        price: 70000,
      },
    },
    owner,
  );
  check(
    edited.vanId === "v4" &&
      edited.date === "2030-01-08" &&
      edited.price === 70000 &&
      edited.received === false,
  );
  const original =
    await db`SELECT original FROM route_visits WHERE owner=${owner} AND id=${edited.id}`;
  check(
    original[0].original.visit.price === null &&
      original[0].original.visit.vanId === "v3",
  );
  current = await updateHistory(
    reception,
    edited.id,
    edited.revision,
    { received: true },
    owner,
  );
  await rejects(
    manageRoute(
      admin,
      {
        action: "archive",
        id: current.id,
        revision: current.revision,
        confirmReceived: false,
      },
      owner,
    ),
    /cobro confirmado/,
  );
  const archived = await manageRoute(
    admin,
    {
      action: "archive",
      id: current.id,
      revision: current.revision,
      confirmReceived: true,
    },
    owner,
  );
  check(!!archived.deletedAt && archived.received === true);
  check((await readHistory(reception, owner)).length === 0);
  check(
    summarizeVisits(boardVisits(state, await readHistory(admin, owner)))
      .amount === 45000,
  );
  const restored = await manageRoute(
    admin,
    { action: "restore", id: archived.id, revision: archived.revision },
    owner,
  );
  check(!restored.deletedAt && restored.received === true);
  check((await readHistory(reception, owner)).length === 1);
  const all = boardVisits(state, await readHistory(admin, owner));
  check(summarizeVisits(all).received === 70000);
  check(summarizeVisits(all).additional === 4);
  const changed = (
    await db`SELECT service_date::text AS date FROM route_visits WHERE owner=${owner} AND id=${restored.id}`
  )[0];
  check(changed.date === "2030-01-08");
  await db`UPDATE team_members SET status='inactive',version=version+1 WHERE id=${reception.id}`;
  await rejects(
    updateHistory(
      reception,
      restored.id,
      restored.revision,
      { received: false },
      owner,
    ),
    AccessError,
  );
  const [master] =
    await db`SELECT payload,revision FROM operation_state WHERE owner=${owner}`;
  check(master.payload === initialPayload && master.revision === 0);
  console.log(
    JSON.stringify({
      integrationChecks: checks,
      importIdempotence: true,
      duplicates: true,
      concurrentReceipt: true,
      receptionRestrictions: true,
      archiveRestore: true,
      masterDataUnchanged: true,
    }),
  );
} finally {
  await db`DELETE FROM route_visits WHERE owner=${owner}`;
  await db`DELETE FROM operation_state WHERE owner=${owner}`;
  await db`DELETE FROM team_audit WHERE actor IN (${admin.name},${reception.name})`;
  await db`DELETE FROM team_members WHERE id IN (${admin.id},${reception.id})`;
  await db.end();
}
