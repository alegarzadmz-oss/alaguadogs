"use client";

import { useAuth } from "@clerk/nextjs";
import { ThemeProvider, useTheme } from "next-themes";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Appearance = "light" | "dark";
const AppearanceContext = createContext<{
  loading: boolean;
  saving: boolean;
  error: string;
  feedback: string;
  choose: (appearance: Appearance) => Promise<void>;
} | null>(null);

function AccountAppearance({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const locked = useRef(false);
  const lifecycle = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    if (enabled) {
      void fetch("/api/preferences", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw Error(data.error);
          if (!controller.signal.aborted) setTheme(data.appearance);
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setError(
              "No se pudo consultar tu apariencia. Puedes volver a elegirla.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }
    return () => controller.abort();
  }, [enabled, setTheme]);

  async function choose(appearance: Appearance) {
    if (!enabled || loading || locked.current) return;
    locked.current = true;
    const previous = theme === "dark" ? "dark" : "light";
    setSaving(true);
    setError("");
    setFeedback("");
    setTheme(appearance);
    try {
      const response = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearance }),
        signal: lifecycle.current?.signal,
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (!lifecycle.current?.signal.aborted)
        setFeedback(
          `Apariencia ${appearance === "dark" ? "oscura" : "clara"} guardada para tu cuenta.`,
        );
    } catch {
      if (!lifecycle.current?.signal.aborted) {
        setTheme(previous);
        setError("No se guardó tu elección. Inténtalo de nuevo.");
      }
    } finally {
      if (!lifecycle.current?.signal.aborted) setSaving(false);
      locked.current = false;
    }
  }

  return (
    <AppearanceContext.Provider
      value={{ loading, saving, error, feedback, choose }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const account = isLoaded && userId ? userId : "guest";
  return (
    <ThemeProvider
      key={account}
      attribute="class"
      storageKey={`alagua:appearance:v1:${account}`}
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <AccountAppearance enabled={account !== "guest"}>
        {children}
      </AccountAppearance>
    </ThemeProvider>
  );
}

export function AppearanceSelector() {
  const { theme } = useTheme();
  const preferences = useContext(AppearanceContext);
  if (!preferences) return null;
  return (
    <div className="appearance-control">
      <div
        className="appearance-choices"
        role="group"
        aria-label="Apariencia de mi cuenta"
        aria-busy={preferences.saving}
      >
        <Button
          type="button"
          variant="ghost"
          aria-pressed={theme === "light"}
          disabled={preferences.loading || preferences.saving}
          onClick={() => void preferences.choose("light")}
        >
          <Sun size={16} aria-hidden="true" /> Claro
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-pressed={theme === "dark"}
          disabled={preferences.loading || preferences.saving}
          onClick={() => void preferences.choose("dark")}
        >
          <Moon size={16} aria-hidden="true" /> Oscuro
        </Button>
      </div>
      <span className="sr-only" role="status">
        {preferences.saving ? "Guardando apariencia…" : preferences.feedback}
      </span>
      {preferences.error && (
        <p className="appearance-error" role="alert">
          {preferences.error}
        </p>
      )}
    </div>
  );
}
