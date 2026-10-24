"use client";
import { useEffect, useState } from "react";
import { ReceiptAmounts } from "./service-receipt";
import type { ServiceReceipt } from "@/lib/service-closeout";
export function OwnerReceipt() {
  const [receipt, setReceipt] = useState<ServiceReceipt | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [photoError, setPhotoError] = useState(false);
  useEffect(() => {
    const token = window.location.hash.slice(1),
      controller = new AbortController(),
      urls: string[] = [];
    void (async () => {
      try {
        const r = await fetch("/api/service-receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await r.json();
        if (!r.ok) throw Error(data.error || "El enlace no está disponible.");
        setReceipt(data.receipt);
        await Promise.allSettled(
          (data.receipt as ServiceReceipt).photos.map(async (photo) => {
            try {
              const image = await fetch("/api/service-receipt", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, photoId: photo.id }),
                cache: "no-store",
                signal: controller.signal,
              });
              if (!image.ok) {
                setPhotoError(true);
                return;
              }
              const blob = await image.blob();
              if (controller.signal.aborted) return;
              const url = URL.createObjectURL(blob);
              urls.push(url);
              setPhotos((current) => ({ ...current, [photo.id]: url }));
            } catch {
              if (!controller.signal.aborted) setPhotoError(true);
            }
          }),
        );
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "No se pudo abrir el recibo.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  return (
    <main className="owner-receipt-page">
      <article className="owner-receipt-card">
        <header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/alagua-dogs-logo.jpg"
            alt="AL’AGUA DOGS · Pets Spa"
          />
          <span>SU BIENESTAR, EN CADA VISITA</span>
        </header>
        {loading && !receipt && (
          <p role="status">Abriendo la foto y el resumen de tu mascota…</p>
        )}
        {error && (
          <div role="alert">
            <h1>Este recibo no está disponible</h1>
            <p>{error}</p>
          </div>
        )}
        {receipt && !error && (
          <>
            <div className="owner-receipt-title">
              <p>Gracias por confiar en nosotros</p>
              <h1>¡{receipt.pets.join(" y ")} ya quedó listo!</h1>
              <span>
                {receipt.date} · {receipt.service}
              </span>
            </div>
            <div className="owner-receipt-photos">
              {receipt.photos.map((photo) => (
                <figure key={photo.id}>
                  {photos[photo.id] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photos[photo.id]}
                        alt={
                          photo.caption || "Tu mascota después de su servicio"
                        }
                      />
                      <figcaption>{photo.caption}</figcaption>
                      <a
                        href={photos[photo.id]}
                        download={`alagua-${photo.id}.jpg`}
                      >
                        Guardar foto
                      </a>
                    </>
                  ) : (
                    <p>{loading ? "Preparando foto…" : "Foto no disponible"}</p>
                  )}
                </figure>
              ))}
            </div>
            {photoError && (
              <p role="alert">
                Una foto no está disponible. Pide a AL’AGUA DOGS que actualice
                el enlace.
              </p>
            )}
            <section>
              <h2>Resumen de tu servicio</h2>
              <ReceiptAmounts receipt={receipt} />
            </section>
            {receipt.ownerNote && (
              <p className="owner-receipt-note">{receipt.ownerNote}</p>
            )}
            <footer>
              <p>Este es un resumen del servicio y sus pagos registrados.</p>
              <button type="button" onClick={() => window.print()}>
                Guardar o imprimir resumen
              </button>
            </footer>
          </>
        )}
      </article>
    </main>
  );
}
