import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { AppearanceProvider } from "@/components/appearance-provider";

export const metadata: Metadata = {
  title: "AL’AGUA DOGS · Operaciones",
  description:
    "Agenda, rutas, clientes y pagos del servicio de estética de mascotas a domicilio.",
  icons: {
    icon: "/brand/alagua-dogs-logo.jpg",
    shortcut: "/brand/alagua-dogs-logo.jpg",
  },
};

export const viewport: Viewport = {
  themeColor: "#ff5e41",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      localization={{
        ...esES,
        signIn: {
          ...esES.signIn,
          start: {
            ...esES.signIn?.start,
            titleCombined: "Entrar o crear tu cuenta",
            subtitleCombined: "para continuar a {{applicationName}}",
          },
        },
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <html lang="es" suppressHydrationWarning>
        <body className="antialiased">
          <AppearanceProvider>{children}</AppearanceProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
