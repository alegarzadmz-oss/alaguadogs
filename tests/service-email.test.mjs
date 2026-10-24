import { test } from "node:test";
import assert from "node:assert/strict";
import { demoState, validateClient } from "../lib/operations.ts";
import { visibleState } from "../lib/team.ts";
import { serviceReceipt } from "../lib/service-closeout.ts";
import { serviceEmailContent, emailStatusText } from "../lib/service-email.ts";
const close = {
  tip: 5000,
  tipMethod: "Efectivo",
  ownerNote: "<script>nota</script>",
  phone: "8112345678",
  email: "owner@example.test",
  completedAt: "now",
  updatedAt: "now",
  updatedBy: "Test",
  revision: 1,
};
test("email for automatic notices is validated in the customer profile and hidden from groomers", () => {
  const s = demoState();
  s.clients[0].email = "OWNER@example.test";
  s.clients[0].phone = "8112345678";
  s.appointments[0].groomerId = "g";
  const m = { id: "g", role: "groomer", status: "active" };
  assert.equal(validateClient(s.clients[0]).email, "owner@example.test");
  assert.throws(() =>
    validateClient({
      ...s.clients[0],
      email: "a@b.com\nBcc:other@example.com",
    }),
  );
  const view = visibleState(s, m);
  assert.equal(view.clients[0].email, "");
  assert.equal(view.clients[0].phone, "");
  assert.equal(s.clients[0].phone, "8112345678");
});
test("automatic mail embeds service photos, keeps tip separate and escapes user content", () => {
  const r = serviceReceipt(
    demoState(),
    { kind: "appointment", id: "a0" },
    close,
    [{ id: "photo", caption: "Luna <boxer>" }],
  );
  const mail = serviceEmailContent(r, "a".repeat(64));
  assert.match(mail.html, /cid:service-photo-0/);
  assert.match(mail.html, /Propina recibida/);
  assert.match(mail.html, /\$50\.00/);
  assert.match(mail.html, /\$700\.00/);
  assert.match(mail.html, /&lt;script&gt;/);
  assert.doesNotMatch(mail.html, /<script>/);
  assert.doesNotMatch(mail.html, /wa\.me|8112345678|owner@example/);
  assert.match(mail.text, /Foto y resumen del servicio/);
});
test("unknown prices and tips remain pending in the mail and status does not claim delivery", () => {
  const s = demoState(),
    r = serviceReceipt(
      s,
      { kind: "history", id: "h" },
      { ...close, tip: null },
      [],
      {
        id: "h",
        clientId: null,
        clientName: "Test",
        pets: [{ name: "Pet" }],
        date: "2026-10-24",
        price: null,
        method: "Pendiente",
        received: null,
      },
    );
  const m = serviceEmailContent(r, "a".repeat(64));
  assert.match(m.html, /Importe por confirmar/);
  assert.match(m.html, /Por registrar/);
  assert.doesNotMatch(m.html, /\$0\.00/);
  assert.match(emailStatusText({ state: "missing_email" }), /Administración/);
  assert.match(emailStatusText({ state: "retry" }), /reintentará/);
});
