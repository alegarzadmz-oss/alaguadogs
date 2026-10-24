import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { demoState } from "../lib/operations.ts";
import {
  closeoutSchema,
  requireServiceAccess,
  serviceReceipt,
  receiptMessage,
  receiptShareLinks,
  whatsappNumber,
} from "../lib/service-closeout.ts";
import { AccessError } from "../lib/team.ts";
import { normalizeServicePhoto } from "../lib/service-photo.ts";
const target = { kind: "appointment", id: "a0" };
const closeout = {
  tip: 5000,
  tipMethod: "Efectivo",
  ownerNote: "¡Gracias!",
  phone: "8112345678",
  email: "dueno@example.test",
  completedAt: "2026-10-24T12:00:00Z",
  updatedAt: "2026-10-24T12:00:00Z",
  updatedBy: "Bañador",
  revision: 1,
};
const member = {
  id: "groomer",
  userId: "clerk:test",
  name: "Bañador",
  email: "groomer@example.test",
  role: "groomer",
  status: "active",
  version: 0,
  vanId: "v1",
};
test("receipt separates service payments and tips without changing the balance or profit inputs", () => {
  const state = demoState(),
    original = structuredClone(state);
  state.payments[0].amount = 40000;
  const expected = structuredClone(state);
  const receipt = serviceReceipt(state, target, closeout, []);
  assert.equal(receipt.price, 65000);
  assert.equal(receipt.paid, 40000);
  assert.equal(receipt.balance, 25000);
  assert.equal(receipt.tip, 5000);
  assert.deepEqual(state, expected);
  assert.equal(original.appointments[0].price, state.appointments[0].price);
  const message = receiptMessage(receipt, "https://alagua.dog/recibo#prueba");
  assert.match(message, /Pago del servicio: \$400\.00/);
  assert.match(message, /Saldo del servicio: \$250\.00/);
  assert.match(message, /Propina: \$50\.00/);
  assert.match(message, /Total recibido, incluida la propina: \$450\.00/);
  for (const privateKey of [
    "address",
    "phone",
    "email",
    "groomer",
    "cost",
    "notes",
  ])
    assert.equal(receipt[privateKey], undefined);
});
test("historical unconfirmed or missing money never turns into a claimed payment, cash default or free service", () => {
  const s = demoState(),
    visit = {
      id: "h",
      clientId: "c0",
      clientName: "Ana",
      pets: [{ name: "Luna", breed: "Poodle" }],
      date: "2026-10-24",
      price: null,
      method: "Pendiente",
      received: null,
    };
  const r = serviceReceipt(
    s,
    { kind: "history", id: "h" },
    { ...closeout, tip: null, tipMethod: null },
    [],
    visit,
  );
  assert.equal(r.price, null);
  assert.equal(r.paid, null);
  assert.equal(r.balance, null);
  assert.deepEqual(r.methods, []);
  const message = receiptMessage(r, "link");
  assert.match(message, /Importe del servicio: por confirmar/);
  assert.match(message, /Propina: por registrar/);
  assert.doesNotMatch(message, /Total recibido|Efectivo|\$0\.00/);
  const confirmed = serviceReceipt(
    s,
    { kind: "history", id: "h" },
    closeout,
    [],
    { ...visit, price: 65000, method: "Transferencia", received: true },
  );
  assert.equal(confirmed.paid, 65000);
  assert.equal(confirmed.balance, 0);
});
test("completed service, explicit tip values and valid contact data are required", () => {
  const data = {
    action: "save",
    ...target,
    revision: 0,
    tip: 0,
    tipMethod: null,
    ownerNote: "",
    phone: "",
    email: "",
    completed: true,
  };
  assert.equal(closeoutSchema.safeParse(data).success, true);
  assert.equal(closeoutSchema.safeParse({ ...data, tip: null }).success, true);
  for (const invalid of [
    { tip: -1 },
    { tip: 1.2 },
    { tip: 500, tipMethod: null },
    { completed: false },
    { email: "a@b.com\r\nBcc:otro@example.com" },
    { unknown: "field" },
  ])
    assert.equal(
      closeoutSchema.safeParse({ ...data, ...invalid }).success,
      false,
    );
  const s = demoState();
  s.appointments[0].status = "En servicio";
  assert.throws(() => serviceReceipt(s, target, closeout, []), /Finaliza/);
});
test("only the assigned groomer or administration can access service photos and tips", () => {
  const s = demoState();
  s.appointments[0].groomerId = member.id;
  s.appointments[1].groomerId = "other";
  assert.doesNotThrow(() => requireServiceAccess(member, target, s));
  assert.throws(
    () => requireServiceAccess(member, { ...target, id: "a1" }, s),
    AccessError,
  );
  assert.throws(
    () => requireServiceAccess({ ...member, role: "reception" }, target, s),
    AccessError,
  );
  assert.throws(
    () => requireServiceAccess({ ...member, status: "inactive" }, target, s),
    AccessError,
  );
  assert.throws(
    () =>
      requireServiceAccess(member, { kind: "history", id: "h" }, s, {
        id: "h",
      }),
    AccessError,
  );
});
test("WhatsApp and email prepare the same reviewed message and do not send anything automatically", () => {
  const r = serviceReceipt(demoState(), target, closeout, []),
    url = "https://alagua.dog/recibo#secreto";
  const links = receiptShareLinks(r, url, "81 1234 5678", "dueno@example.test");
  assert.equal(whatsappNumber("81 1234 5678"), "528112345678");
  assert.equal(whatsappNumber("no disponible"), "");
  assert.match(links.whatsapp, /^https:\/\/wa\.me\/528112345678\?text=/);
  assert.equal(new URL(links.whatsapp).searchParams.get("text"), links.message);
  assert.equal(
    decodeURIComponent(links.email.split("&body=")[1]),
    links.message,
  );
  assert.match(links.message, /#secreto/);
});
test("photos are resized and re-encoded to JPEG without EXIF, and non-photo files are rejected", async () => {
  const source = await sharp({
    create: { width: 1800, height: 1200, channels: 3, background: "#86d4cd" },
  })
    .withExif({ IFD0: { Artist: "private-metadata" } })
    .jpeg()
    .toBuffer();
  const image = await normalizeServicePhoto(source),
    metadata = await sharp(image).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 1400);
  assert.equal(metadata.exif, undefined);
  await assert.rejects(
    normalizeServicePhoto(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
      ),
    ),
  );
  await assert.rejects(normalizeServicePhoto(Buffer.alloc(2500001)));
});
