import { money } from "./operations";
import {
  receiptMessage,
  type ServiceEmailStatus,
  type ServiceReceipt,
} from "./service-closeout";
export const MAIL_SENDER = "AL’AGUA DOGS <citas@alagua.dog>";
export const receiptURL = (token: string) =>
  "https://alagua.dog/recibo#" + token;
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function serviceEmailContent(r: ServiceReceipt, token: string) {
  const url = receiptURL(token),
    pets = escape(r.pets.join(" y "));
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 0;color:#666174">${label}</td><td style="padding:8px 0;text-align:right;font-weight:700">${escape(value)}</td></tr>`;
  const photos = r.photos
    .map(
      (p, i) =>
        `<div style="margin:20px 0"><img src="cid:service-photo-${i}" alt="${escape(p.caption || "Tu mascota después del servicio")}" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px"/><p style="color:#666174;font-size:13px">${escape(p.caption)}</p></div>`,
    )
    .join("");
  return {
    subject: `Así quedó ${r.pets.join(" y ")} · AL’AGUA DOGS`,
    text: receiptMessage(r, url),
    html: `<!doctype html><html lang="es"><body style="margin:0;background:#f8f4ee;color:#201d33;font-family:Arial,sans-serif"><div style="max-width:620px;margin:24px auto;background:white;border-top:6px solid #ff5e41;border-radius:16px;padding:28px"><p style="font-weight:800;letter-spacing:2px">AL’AGUA DOGS · PETS SPA</p><h1 style="font-size:26px">¡Servicio terminado para ${pets}!</h1><p>${escape(r.date)} · ${escape(r.service)}</p>${photos}<h2 style="font-size:19px">Resumen de tu servicio</h2><table style="width:100%;background:#eff9f7;border-radius:12px;padding:12px">${row("Servicio", r.price === null ? "Importe por confirmar" : money(r.price))}${row("Pago del servicio", r.paid === null ? "Pendiente de confirmar" : money(r.paid))}${row("Forma de pago", r.methods.join(" / ") || "Por confirmar")}${r.balance === null ? "" : row("Saldo del servicio", money(r.balance))}${row("Propina recibida", r.tip === null ? "Por registrar" : money(r.tip) + (r.tip && r.tipMethod ? ` · ${r.tipMethod}` : ""))}${r.paid !== null && r.tip !== null ? row("Total recibido", money(r.paid + r.tip)) : ""}</table>${r.ownerNote ? `<p style="white-space:pre-wrap">${escape(r.ownerNote)}</p>` : ""}<p style="margin:28px 0"><a href="${url}" style="background:#ff5e41;color:#201d33;text-decoration:none;font-weight:700;border-radius:8px;padding:13px 20px;display:inline-block">Ver fotos y resumen</a></p><p>¡Gracias por confiar en nosotros!</p><p style="font-size:12px;color:#666174">El enlace estará disponible durante siete días. Este mensaje es automático. Para cambios en tu cita, contacta a Administración por el canal habitual.</p></div></body></html>`,
  };
}
export function emailStatusText(s?: ServiceEmailStatus | null) {
  if (!s || s.state === "not_saved")
    return "El correo se preparará al guardar el cierre.";
  if (s.state === "awaiting_photo")
    return "Falta guardar la foto para preparar el correo.";
  if (s.state === "missing_email")
    return "Falta el correo del cliente. Administración debe registrarlo para completar el envío.";
  if (s.state === "sent")
    return (
      "Correo enviado automáticamente" +
      (s.sentAt
        ? ` · ${new Date(s.sentAt).toLocaleString("es-MX", { timeZone: "America/Monterrey" })}`
        : "") +
      "."
    );
  if (s.state === "pending" || s.state === "sending")
    return "Correo preparado; el sistema está completando el envío.";
  if (s.state === "retry")
    return "El cierre está guardado. El sistema reintentará el correo automáticamente.";
  if (s.state === "canceled")
    return "El servicio cambió. Guarda el cierre actualizado para preparar otro correo.";
  return "El cierre está guardado; Administración debe revisar el envío del correo.";
}
