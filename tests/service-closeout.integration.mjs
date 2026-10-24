// Explicit integration test. Uses an isolated owner, fake identities and disposable Blob files.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { get, del } from "@vercel/blob";
import { database } from "../db/store.ts";
import { demoState } from "../lib/operations.ts";
import { normalizeServicePhoto } from "../lib/service-photo.ts";
import {
  addServicePhoto,
  readCloseout,
  saveCloseout,
  createReceiptShare,
  sharedReceipt,
  revokeReceiptShares,
  removeServicePhoto,
  servicePhotoPath,
} from "../db/service-closeout.ts";
import { AccessError } from "../lib/team.ts";
const db = database(),
  prefix = `closeout-test-${crypto.randomUUID()}`,
  owner = `test:${prefix}`;
const admin = {
  id: prefix,
  name: prefix,
  email: prefix + "@example.test",
  userId: `clerk:${prefix}`,
  role: "admin",
  status: "active",
  version: 0,
  vanId: "",
};
const groomer = {
  ...admin,
  id: prefix + "-g",
  name: prefix + " groomer",
  email: prefix + "-g@example.test",
  userId: `clerk:${prefix}-g`,
  role: "groomer",
};
const reception = {
  ...admin,
  id: prefix + "-r",
  name: prefix + " reception",
  email: prefix + "-r@example.test",
  userId: `clerk:${prefix}-r`,
  role: "reception",
};
const state = demoState();
state.appointments[0].groomerId = groomer.id;
state.appointments[0].date = "2026-10-24";
state.clients[0].name = "Cliente de prueba";
state.clients[0].pets[0].name = "Akira (ejemplo)";
const target = { kind: "appointment", id: "a0" };
let checks = 0,
  keep = false;
const files = [];
const check = (v) => {
  assert.ok(v);
  checks++;
};
const reject = async (p, pattern) => {
  await assert.rejects(p, pattern);
  checks++;
};
async function paths() {
  return await db`SELECT pathname FROM service_photos WHERE owner=${owner}`;
}
try {
  for (const m of [admin, groomer, reception])
    await db`INSERT INTO team_members(id,email,name,role,status,user_id,created_at) VALUES (${m.id},${m.email},${m.name},${m.role},'active',${m.userId},${new Date().toISOString()})`;
  const original = JSON.stringify(state);
  await db`INSERT INTO operation_state(owner,payload,revision) VALUES (${owner},${original},0)`;
  const initial = await readCloseout(groomer, target, owner);
  check(initial.closeout === null && initial.photos.length === 0);
  await reject(readCloseout(reception, target, owner), AccessError);
  await reject(
    readCloseout(groomer, { ...target, id: "a3" }, owner),
    AccessError,
  );
  const raw = {
    action: "save",
    ...target,
    revision: 0,
    tip: 5000,
    tipMethod: "Efectivo",
    ownerNote:
      "Recibo de prueba: imagen ilustrativa de Akira. No corresponde a un servicio real.",
    phone: "",
    email: "",
    completed: true,
  };
  const saved = await saveCloseout(groomer, raw, owner);
  check(saved.closeout.revision === 1 && saved.receipt.tip === 5000);
  check(saved.receipt.paid === 65000 && saved.receipt.balance === 0);
  await reject(saveCloseout(groomer, raw, owner), /cambió/);
  await reject(createReceiptShare(groomer, target, owner), /al menos una foto/);
  const bytes = await normalizeServicePhoto(
      await readFile(
        new URL("../public/brand/akira-boxer.png", import.meta.url),
      ),
    ),
    photoId = crypto.randomUUID();
  const photos = await addServicePhoto(
    groomer,
    target,
    photoId,
    "Akira · imagen de prueba",
    bytes,
    owner,
  );
  check(photos.length === 1);
  const repeat = await addServicePhoto(
    groomer,
    target,
    photoId,
    "Akira · imagen de prueba",
    bytes,
    owner,
  );
  check(repeat.length === 1);
  const path = await servicePhotoPath(groomer, photoId, owner);
  files.push(path);
  const blob = await get(path, { access: "private" });
  check(blob?.statusCode === 200);
  const response = await fetch(blob.blob.url);
  check(
    response.status === 403 ||
      response.status === 401 ||
      response.status === 404,
  );
  await reject(servicePhotoPath(reception, photoId, owner), AccessError);
  const share = await createReceiptShare(groomer, target, owner);
  check(share.token.length === 64);
  check(!!(await sharedReceipt(share.token))?.receipt);
  check((await sharedReceipt(share.token, photoId))?.pathname === path);
  check((await sharedReceipt("0".repeat(64))) === null);
  check((await sharedReceipt(share.token, crypto.randomUUID())) === null);
  const [stored] =
    await db`SELECT token_hash FROM service_receipt_shares WHERE owner=${owner}`;
  check(stored.token_hash !== share.token);
  await revokeReceiptShares(admin, target, owner);
  check((await sharedReceipt(share.token)) === null);
  const nextShare = await createReceiptShare(admin, target, owner);
  await saveCloseout(
    admin,
    { ...raw, revision: 1, tip: 0, tipMethod: null },
    owner,
  );
  check((await sharedReceipt(nextShare.token)) === null);
  const expired = await createReceiptShare(admin, target, owner);
  await db`UPDATE service_receipt_shares SET expires_at='2000-01-01T00:00:00Z' WHERE owner=${owner}`;
  check((await sharedReceipt(expired.token)) === null);
  const beforeRemove = await createReceiptShare(admin, target, owner);
  check(
    (await removeServicePhoto(groomer, target, photoId, owner)).length === 0,
  );
  check((await sharedReceipt(beforeRemove.token)) === null);
  await reject(servicePhotoPath(groomer, photoId, owner), /no disponible/);
  const restoredPhotoId = crypto.randomUUID();
  await addServicePhoto(
    admin,
    target,
    restoredPhotoId,
    "Akira · imagen de prueba",
    bytes,
    owner,
  );
  const last = await createReceiptShare(admin, target, owner);
  check(!!(await sharedReceipt(last.token))?.receipt);
  const changed = structuredClone(state);
  changed.payments[0].amount = 40000;
  await db`UPDATE operation_state SET payload=${JSON.stringify(changed)} WHERE owner=${owner}`;
  check((await sharedReceipt(last.token)) === null);
  await db`UPDATE operation_state SET payload=${original} WHERE owner=${owner}`;
  const [master] =
    await db`SELECT payload,revision FROM operation_state WHERE owner=${owner}`;
  check(master.payload === original && master.revision === 0);
  await db`UPDATE team_members SET status='inactive',version=version+1 WHERE id=${groomer.id}`;
  await reject(readCloseout(groomer, target, owner), AccessError);
  if (process.env.KEEP_CLOSEOUT_FIXTURE === "1") {
    const current = await readCloseout(admin, target, owner);
    const finalShare = await createReceiptShare(admin, target, owner);
    await writeFile(
      "private/closeout-2026-10-24/browser-fixture.json",
      JSON.stringify(
        {
          owner,
          memberIds: [admin.id, groomer.id, reception.id],
          actors: [admin.name, groomer.name, reception.name],
          paths: (await paths()).map((x) => x.pathname),
          token: finalShare.token,
          receipt: current.receipt,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    keep = true;
  }
  console.log(
    JSON.stringify({
      integrationChecks: checks,
      privatePhoto: true,
      idempotentUpload: true,
      revocation: true,
      expiry: true,
      staleFinancialDataRejected: true,
      roleRestrictions: true,
      isolatedOwner: true,
      fixtureKept: keep,
    }),
  );
} finally {
  if (!keep) {
    for (const row of await paths()) await del(row.pathname);
    await db`DELETE FROM service_receipt_shares WHERE owner=${owner}`;
    await db`DELETE FROM service_photos WHERE owner=${owner}`;
    await db`DELETE FROM service_closeouts WHERE owner=${owner}`;
    await db`DELETE FROM operation_state WHERE owner=${owner}`;
    await db`DELETE FROM team_audit WHERE actor IN (${admin.name},${groomer.name},${reception.name})`;
    await db`DELETE FROM team_members WHERE id IN (${admin.id},${groomer.id},${reception.id})`;
  }
  await db.end();
}
