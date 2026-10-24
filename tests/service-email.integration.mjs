// Isolated owner and fake Clerk identities. Uses private Blob but no email is sent by this test.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { del } from "@vercel/blob";
import { database } from "../db/store.ts";
import { demoState } from "../lib/operations.ts";
import { normalizeServicePhoto } from "../lib/service-photo.ts";
import {
  saveCloseout,
  readCloseout,
  addServicePhoto,
  createReceiptShare,
  retryCloseoutEmail,
} from "../db/service-closeout.ts";
import { sendServiceEmail } from "../db/service-email.ts";
import { AccessError } from "../lib/team.ts";
const db = database(),
  prefix = `mail-test-${crypto.randomUUID()}`,
  owner = `test:${prefix}`,
  target = { kind: "appointment", id: "a0" };
const admin = {
    id: prefix,
    name: prefix,
    email: prefix + "@example.test",
    userId: "clerk:" + prefix,
    role: "admin",
    status: "active",
    version: 0,
    vanId: "",
  },
  groomer = {
    ...admin,
    id: prefix + "-g",
    name: prefix + " groomer",
    email: prefix + "-g@example.test",
    userId: "clerk:" + prefix + "-g",
    role: "groomer",
  };
const state = demoState();
state.appointments[0].groomerId = groomer.id;
state.clients[0].email = "owner@example.test";
state.clients[0].phone = "8112345678";
const payload = JSON.stringify(state);
const raw = {
  action: "save",
  ...target,
  revision: 0,
  tip: 5000,
  tipMethod: "Efectivo",
  ownerNote: "Test",
  phone: "",
  email: "",
  completed: true,
};
let checks = 0;
const check = (v) => {
    assert.ok(v);
    checks++;
  },
  reject = async (p, e) => {
    await assert.rejects(p, e);
    checks++;
  };
let calls = 0,
  requests = [];
const transport = async (body, key) => {
  calls++;
  requests.push({ body, key });
  return { id: "test-provider-" + calls };
};
try {
  for (const m of [admin, groomer])
    await db`INSERT INTO team_members(id,email,name,role,status,user_id,created_at)VALUES(${m.id},${m.email},${m.name},${m.role},'active',${m.userId},${new Date().toISOString()})`;
  await db`INSERT INTO operation_state(owner,payload,revision)VALUES(${owner},${payload},0)`;
  await reject(saveCloseout(groomer, raw, owner), /foto/);
  const bytes = await normalizeServicePhoto(
    await readFile(new URL("../public/brand/akira-boxer.png", import.meta.url)),
  );
  await addServicePhoto(
    groomer,
    target,
    crypto.randomUUID(),
    "Test",
    bytes,
    owner,
  );
  await reject(
    saveCloseout(groomer, { ...raw, email: "someone@example.test" }, owner),
    AccessError,
  );
  await reject(createReceiptShare(groomer, target, owner), AccessError);
  const saved = await saveCloseout(groomer, raw, owner);
  check(!!saved.emailJobId);
  check(saved.closeout.email === "" && saved.closeout.phone === "");
  const view = await readCloseout(groomer, target, owner);
  check(
    view.phone === "" &&
      view.email === "" &&
      view.canManageContacts === false &&
      view.delivery.recipient === undefined,
  );
  const unchanged = await saveCloseout(groomer, { ...raw, revision: 1 }, owner);
  check(unchanged.emailJobId === saved.emailJobId);
  check(
    Number(
      (
        await db`SELECT count(*) FROM service_email_outbox WHERE owner=${owner}`
      )[0].count,
    ) === 1,
  );
  const sent = await Promise.all([
    sendServiceEmail(saved.emailJobId, transport),
    sendServiceEmail(saved.emailJobId, transport),
  ]);
  check(sent.every((r) => r.status === "sent") && calls === 1);
  check(
    requests[0].body.to[0] === "owner@example.test" &&
      requests[0].body.from.includes("citas@alagua.dog"),
  );
  check(requests[0].body.attachments[0].contentId === "service-photo-0");
  check(requests[0].body.attachments[0].content.length > 0);
  const sentView = await readCloseout(groomer, target, owner);
  check(
    sentView.delivery.state === "sent" &&
      sentView.delivery.recipient === undefined,
  );
  const unchangedSent = await saveCloseout(
    groomer,
    { ...raw, revision: 2 },
    owner,
  );
  check(unchangedSent.emailJobId === null && calls === 1);
  const [job] =
    await db`SELECT share_token,status,provider_id FROM service_email_outbox WHERE id=${saved.emailJobId}`;
  check(job.share_token === null && job.status === "sent" && !!job.provider_id);
  const updated = await saveCloseout(
    groomer,
    { ...raw, revision: 3, tip: 6000 },
    owner,
  );
  check(updated.emailJobId !== saved.emailJobId);
  const failed = await sendServiceEmail(updated.emailJobId, async () => {
    throw Error("rate_limit_exceeded");
  });
  check(failed.status === "retry");
  const retryId = await retryCloseoutEmail(admin, target, owner);
  check(retryId === updated.emailJobId);
  await sendServiceEmail(retryId, transport);
  check(calls === 2);
  await reject(retryCloseoutEmail(groomer, target, owner), AccessError);
  const stale = await saveCloseout(
    groomer,
    { ...raw, revision: 4, tip: 7000 },
    owner,
  );
  const changed = structuredClone(state);
  changed.payments[0].amount = 40000;
  await db`UPDATE operation_state SET payload=${JSON.stringify(changed)} WHERE owner=${owner}`;
  const canceled = await sendServiceEmail(stale.emailJobId, transport);
  check(canceled.status === "canceled" && calls === 2);
  await db`UPDATE operation_state SET payload=${payload} WHERE owner=${owner}`;
  await db`UPDATE team_members SET status='inactive',version=version+1 WHERE id=${groomer.id}`;
  await reject(
    saveCloseout(groomer, { ...raw, revision: 5 }, owner),
    AccessError,
  );
  const [master] =
    await db`SELECT payload,revision FROM operation_state WHERE owner=${owner}`;
  check(master.payload === payload && master.revision === 0);
  console.log(
    JSON.stringify({
      integrationChecks: checks,
      duplicateProtection: true,
      concurrentDispatch: true,
      recipientIsolation: true,
      inlinePhotos: true,
      retries: true,
      staleJobCanceled: true,
      realEmailSent: false,
    }),
  );
} finally {
  for (const row of await db`SELECT pathname FROM service_photos WHERE owner=${owner}`)
    await del(row.pathname);
  await db`DELETE FROM service_email_outbox WHERE owner=${owner}`;
  await db`DELETE FROM service_receipt_shares WHERE owner=${owner}`;
  await db`DELETE FROM service_photos WHERE owner=${owner}`;
  await db`DELETE FROM service_closeouts WHERE owner=${owner}`;
  await db`DELETE FROM operation_state WHERE owner=${owner}`;
  await db`DELETE FROM team_audit WHERE actor IN(${admin.name},${groomer.name})`;
  await db`DELETE FROM team_members WHERE id IN(${admin.id},${groomer.id})`;
  await db.end();
}
