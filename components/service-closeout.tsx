"use client";
import { useEffect, useId, useState } from "react";
import {
  Camera,
  Copy,
  ImagePlus,
  Mail,
  MessageCircle,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ReceiptAmounts } from "@/components/service-receipt";
import {
  MAX_SERVICE_PHOTOS,
  receiptShareLinks,
  type ServiceTarget,
  type ServiceCloseout as Closeout,
  type ServicePhoto,
  type ServiceReceipt,
  type ServiceEmailStatus,
} from "@/lib/service-closeout";
import { emailStatusText } from "@/lib/service-email";

type FormValues = {
  tip: string;
  tipMethod: string;
  ownerNote: string;
  phone: string;
  email: string;
  completed: boolean;
};
const formValues = (
  c: Closeout | null,
  phone: string,
  email = "",
): FormValues => ({
  tip: c?.tip == null ? "" : String(c.tip / 100),
  tipMethod: c?.tipMethod || "",
  ownerNote: c?.ownerNote || "",
  phone: c?.phone || phone,
  email: c?.email || email,
  completed: !!c,
});
async function compressPhoto(file: File) {
  if (file.size > 25000000) throw Error("Selecciona una foto de hasta 25 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const ratio = Math.min(
      1,
      1600 / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("No se pudo preparar la imagen.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(Error("No se pudo preparar la imagen.")),
        "image/jpeg",
        0.82,
      ),
    );
    if (blob.size > 2500000)
      throw Error(
        "La foto sigue siendo demasiado grande. Selecciona una versión más pequeña.",
      );
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function ServiceCloseout({
  target,
  label = "Foto y recibo",
}: {
  target: ServiceTarget;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Camera size={16} />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="service-closeout-dialog">
          <DialogHeader>
            <DialogTitle>Foto y cierre del servicio</DialogTitle>
            <DialogDescription>
              Guarda la foto y el cierre; el sistema enviará el resumen por
              correo al dueño.
            </DialogDescription>
          </DialogHeader>
          {open && <CloseoutForm target={target} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
function CloseoutForm({ target }: { target: ServiceTarget }) {
  const id = useId();
  const [closeout, setCloseout] = useState<Closeout | null>(null);
  const [photos, setPhotos] = useState<ServicePhoto[]>([]);
  const [receipt, setReceipt] = useState<ServiceReceipt | null>(null);
  const [form, setForm] = useState<FormValues>(() => formValues(null, ""));
  const [savedForm, setSavedForm] = useState("");
  const [loading, setLoading] = useState(true);
  const [canManageContacts, setCanManageContacts] = useState(false);
  const [delivery, setDelivery] = useState<ServiceEmailStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<{
    blob: Blob;
    url: string;
    id: string;
  } | null>(null);
  const [share, setShare] = useState<{
    url: string;
    receipt: ServiceReceipt;
    expiresAt: string;
  } | null>(null);
  const dirty = JSON.stringify(form) !== savedForm;
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `/api/service-closeout?kind=${target.kind}&id=${encodeURIComponent(target.id)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await r.json();
        if (!r.ok) throw Error(data.error || "No se pudo abrir el cierre.");
        const values = formValues(data.closeout, data.phone, data.email);
        setCanManageContacts(data.canManageContacts === true);
        setDelivery(data.delivery);
        setCloseout(data.closeout);
        setPhotos(data.photos);
        setReceipt(data.receipt);
        setCaption(data.receipt?.pets.join(" y ") || "");
        setForm(values);
        setSavedForm(JSON.stringify(values));
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "No se pudo cargar.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [target.kind, target.id]);
  useEffect(
    () => () => {
      if (selected) URL.revokeObjectURL(selected.url);
    },
    [selected],
  );
  function edit<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setForm({ ...form, [key]: value });
    setShare(null);
    setNotice("");
  }
  async function action(action: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (
        action === "save" &&
        form.tip !== "" &&
        !/^\d+(?:\.\d{1,2})?$/.test(form.tip)
      )
        throw Error("Revisa la propina; usa hasta dos decimales.");
      const body =
        action === "save"
          ? {
              ...target,
              action,
              revision: closeout?.revision || 0,
              tip: form.tip === "" ? null : Math.round(Number(form.tip) * 100),
              tipMethod: form.tipMethod || null,
              ownerNote: form.ownerNote,
              phone: form.phone,
              email: form.email.trim(),
              completed: form.completed,
            }
          : { ...target, action };
      const r = await fetch("/api/service-closeout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error || "No se pudo guardar.");
      if (action === "save") {
        const values = formValues(
          data.closeout,
          data.phone || "",
          data.email || "",
        );
        setDelivery(data.delivery);
        setCanManageContacts(data.canManageContacts === true);
        setCloseout(data.closeout);
        setPhotos(data.photos);
        setReceipt(data.receipt);
        setForm(values);
        setSavedForm(JSON.stringify(values));
        setShare(null);
        setNotice("Cierre guardado. " + emailStatusText(data.delivery));
      } else if (action === "share") {
        setShare({
          url:
            new URL("/recibo", window.location.origin).href + "#" + data.token,
          receipt: data.receipt,
          expiresAt: data.expiresAt,
        });
        setNotice(
          "Enlace preparado. Revisa el destinatario y el mensaje antes de enviarlo.",
        );
      } else {
        setShare(null);
        setNotice(
          "Los enlaces anteriores ya no permiten abrir la foto ni el recibo.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }
  async function photoAction(remove?: string) {
    if (busy || (!remove && !selected)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = new FormData();
      data.set("kind", target.kind);
      data.set("id", target.id);
      data.set("photoId", remove || selected!.id);
      if (remove) data.set("action", "remove");
      else {
        data.set("caption", caption);
        data.set("file", selected!.blob, "servicio.jpg");
      }
      const r = await fetch("/api/service-photos", {
        method: "POST",
        body: data,
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error || "No se pudo guardar la foto.");
      setPhotos(result.photos);
      setSelected(null);
      setShare(null);
      if (closeout) {
        setSavedForm("");
        setDelivery({ state: "canceled" });
      }
      setNotice(
        remove
          ? "Foto retirada. Los enlaces anteriores se revocaron."
          : "Foto guardada en el historial del servicio.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la foto.");
    } finally {
      setBusy(false);
    }
  }
  async function selectPhoto(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const blob = await compressPhoto(file);
      setSelected({
        blob,
        url: URL.createObjectURL(blob),
        id: crypto.randomUUID(),
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo abrir la foto. Usa JPG, PNG o WebP.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Cargando cierre del servicio…</p>;
  if (!receipt)
    return (
      <p role="alert">
        {error || "No se pudo abrir el servicio. Cierra y vuelve a intentar."}
      </p>
    );
  const links = share
    ? receiptShareLinks(share.receipt, share.url, form.phone, form.email)
    : null;
  return (
    <div className="service-closeout-form">
      <div className="service-closeout-intro">
        <strong>{receipt.pets.join(" y ")}</strong>
        <span>
          {receipt.clientName} · {receipt.date}
        </span>
      </div>
      <ReceiptAmounts receipt={receipt} />
      <p className="footnote">
        El pago se toma de los cobros registrados. Si falta, regístralo en el
        servicio o revisa la visita antes de compartir.
      </p>
      <section className="service-photo-section">
        <h3>Así quedó la mascota</h3>
        <p className="muted">
          Puedes guardar hasta {MAX_SERVICE_PHOTOS} fotos por servicio.
        </p>
        <div className="service-photos-grid">
          {photos.map((photo) => (
            <figure key={photo.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/service-photos/${photo.id}`}
                alt={photo.caption || "Mascota después del servicio"}
              />
              <figcaption>
                {photo.caption}
                <small>{photo.createdBy}</small>
              </figcaption>
              <a
                href={`/api/service-photos/${photo.id}`}
                download={`alagua-servicio-${photo.id}.jpg`}
              >
                Descargar foto
              </a>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void photoAction(photo.id)}
              >
                Quitar del cierre
              </Button>
            </figure>
          ))}
        </div>
        {photos.length < MAX_SERVICE_PHOTOS && (
          <>
            <div className="button-row service-photo-inputs">
              <label className="service-file-button" htmlFor={`${id}-camera`}>
                <Camera size={16} />
                Tomar foto
                <input
                  id={`${id}-camera`}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  disabled={busy}
                  onChange={(e) => {
                    void selectPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="service-file-button" htmlFor={`${id}-file`}>
                <ImagePlus size={16} />
                Elegir de galería
                <input
                  id={`${id}-file`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  disabled={busy}
                  onChange={(e) => {
                    void selectPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {selected && (
              <div className="service-photo-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.url}
                  alt="Vista previa de la foto seleccionada"
                />
                <label>
                  Mascota o descripción
                  <Input
                    value={caption}
                    maxLength={160}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                </label>
                <div className="button-row">
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void photoAction()}
                  >
                    Guardar foto
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setSelected(null)}
                  >
                    Descartar selección
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
      <section className="service-closeout-fields">
        <h3>Propina y mensaje para el dueño</h3>
        <div className="capture-two">
          <label>
            Propina recibida (MXN)
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Por registrar"
              value={form.tip}
              onChange={(e) => edit("tip", e.target.value)}
            />
          </label>
          <label>
            Cómo se recibió la propina
            <select
              value={form.tipMethod}
              onChange={(e) => edit("tipMethod", e.target.value)}
            >
              <option value="">Seleccionar</option>
              {["Efectivo", "Tarjeta", "Transferencia"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="footnote">
          Captura 0 si no hubo propina; deja vacío si todavía está por
          confirmar.
        </p>
        <label>
          Mensaje para el dueño
          <textarea
            rows={3}
            maxLength={600}
            value={form.ownerNote}
            onChange={(e) => edit("ownerNote", e.target.value)}
            placeholder="¡Gracias por confiar en nosotros!"
          />
        </label>
        {canManageContacts && (
          <div className="capture-two">
            <label>
              WhatsApp del dueño
              <Input
                type="tel"
                value={form.phone}
                maxLength={40}
                onChange={(e) => edit("phone", e.target.value)}
                placeholder="10 dígitos o código de país"
              />
            </label>
            <label>
              Correo del dueño
              <Input
                type="email"
                value={form.email}
                maxLength={254}
                onChange={(e) => edit("email", e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </label>
          </div>
        )}
        {!canManageContacts && (
          <p className="footnote">
            Administración registra el correo del dueño. Al guardar este cierre,
            el servidor enviará la foto y el resumen automáticamente.
          </p>
        )}
        <label className="rh-checkbox">
          <input
            type="checkbox"
            checked={form.completed}
            onChange={(e) => edit("completed", e.target.checked)}
          />
          Confirmo que el servicio está terminado y revisé el pago y la propina.
        </label>
        <Button
          type="button"
          disabled={busy || !form.completed || !photos.length || !!selected}
          onClick={() => void action("save")}
        >
          {busy ? "Guardando y enviando…" : "Guardar cierre y enviar correo"}
        </Button>
        {closeout && (
          <small className="muted">
            Guardado por {closeout.updatedBy} ·{" "}
            {new Date(closeout.updatedAt).toLocaleString("es-MX")}
          </small>
        )}
      </section>
      <section className="service-email-status" aria-label="Correo automático">
        <h3>Correo automático al dueño</h3>
        <p role="status">{emailStatusText(delivery)}</p>
        {canManageContacts && delivery?.recipient && (
          <small>Destinatario: {delivery.recipient}</small>
        )}
        {canManageContacts && closeout && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || dirty || delivery?.state === "sent"}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/service-email", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(target),
                });
                const data = await r.json();
                if (!r.ok) throw Error(data.error || "No se pudo reintentar.");
                const reload = await fetch(
                  `/api/service-closeout?kind=${target.kind}&id=${encodeURIComponent(target.id)}`,
                  { cache: "no-store" },
                );
                const current = await reload.json();
                if (!reload.ok)
                  throw Error(current.error || "Actualiza el cierre.");
                setDelivery(current.delivery);
                setCloseout(current.closeout);
                setReceipt(current.receipt);
                const values = formValues(
                  current.closeout,
                  current.phone || "",
                  current.email || "",
                );
                setForm(values);
                setSavedForm(JSON.stringify(values));
                setNotice(emailStatusText(current.delivery));
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "No se pudo reintentar.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Revisar o reintentar correo
          </Button>
        )}
      </section>
      {canManageContacts && (
        <section className="service-share-section">
          <h3>Compartir con el dueño</h3>
          <p>
            El enlace incluye la foto y este recibo. Vence en 7 días y puedes
            revocarlo.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy || dirty || !closeout || !photos.length}
            onClick={() => void action("share")}
          >
            <Share2 size={16} />
            Preparar foto y recibo para enviar
          </Button>
          {(!closeout || dirty || !photos.length) && (
            <p className="footnote">
              Guarda el cierre y al menos una foto para preparar el envío.
            </p>
          )}
          {share && links && (
            <div className="service-share-preview">
              <label>
                Mensaje que verá el dueño
                <textarea rows={9} readOnly value={links.message} />
              </label>
              <div className="button-row">
                <a
                  className="service-file-button"
                  href={links.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={16} />
                  Abrir WhatsApp
                </a>
                <a className="service-file-button" href={links.email}>
                  <Mail size={16} />
                  Preparar correo
                </a>
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(links.message);
                      setNotice("Mensaje copiado.");
                    } catch {
                      setError("Selecciona y copia el mensaje de arriba.");
                    }
                  }}
                >
                  <Copy size={16} />
                  Copiar mensaje
                </Button>
              </div>
              <small>
                WhatsApp y correo se abren para que revises el destinatario y
                completes el envío. El enlace contiene datos del servicio;
                compártelo con su dueño.
              </small>
              <small>
                Válido hasta {new Date(share.expiresAt).toLocaleString("es-MX")}
                .
              </small>
            </div>
          )}
          {closeout && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void action("revoke")}
            >
              Revocar enlaces compartidos
            </Button>
          )}
        </section>
      )}
      {notice && (
        <p role="status" className="message success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
    </div>
  );
}
