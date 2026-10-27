"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
export function AppRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:")
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
  }, []);
  return null;
}

export function AppInstall() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const sync = () =>
      setInstalled(
        display.matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone ===
            true,
      );
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const complete = () => {
      setInstalled(true);
      setPrompt(null);
      setOpen(false);
    };
    sync();
    display.addEventListener("change", sync);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => {
      display.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
    };
  }, []);
  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    setError("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setOpen(false);
      setPrompt(null);
    } catch {
      setError(
        "Abre el menú del navegador y elige Instalar app o Agregar a pantalla de inicio.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (installed) return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Instalar app de AL’AGUA DOGS"
        title="Instalar app"
        onClick={() => setOpen(true)}
      >
        <Download size={18} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="app-install-dialog">
          <DialogHeader>
            <DialogTitle>AL’AGUA DOGS en tu celular</DialogTitle>
            <DialogDescription>
              Abre la app desde su icono en la pantalla de inicio.
            </DialogDescription>
          </DialogHeader>
          <Image
            unoptimized
            className="app-install-logo"
            src="/app-icons/icon-192.png"
            alt="AL’AGUA DOGS"
            width={96}
            height={96}
          />
          {prompt && (
            <Button disabled={busy} onClick={() => void install()}>
              <Download size={18} />
              {busy ? "Abriendo instalación…" : "Instalar app"}
            </Button>
          )}
          <section>
            <h3>
              <Share size={17} /> iPhone / iPad
            </h3>
            <ol>
              <li>
                Abre <strong>alagua.dog</strong> en Safari.
              </li>
              <li>
                Toca <strong>Compartir → Agregar a pantalla de inicio</strong>.
              </li>
              <li>
                Activa <strong>Abrir como app web</strong> si aparece y toca{" "}
                <strong>Agregar</strong>.
              </li>
            </ol>
          </section>
          <section>
            <h3>
              <Smartphone size={17} /> Android
            </h3>
            <p>
              En Chrome, abre el menú <strong>⋮ → Instalar app</strong> o{" "}
              <strong>Agregar a pantalla principal</strong> y confirma la
              instalación.
            </p>
          </section>
          <p className="muted">
            Entra con tu correo autorizado. Administración conserva todo el
            portal; cada bañador ve su trabajo asignado. Necesitas internet para
            consultar y guardar datos actualizados.
          </p>
          {error && <p role="alert">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
