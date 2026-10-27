import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";
import { AppearanceProvider } from "@/components/appearance-provider";
import { AppRegistration } from "@/components/app-install";

export const metadata: Metadata = {
  title: "AL’AGUA DOGS · Operaciones",
  description:
    "Agenda, rutas, clientes y pagos del servicio de estética de mascotas a domicilio.",
  icons: {
    icon: "/brand/alagua-dogs-logo.jpg",
    shortcut: "/brand/alagua-dogs-logo.jpg",
    apple: "/app-icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "AL’AGUA DOGS",
    statusBarStyle: "default",
  },
  applicationName: "AL’AGUA DOGS",
};

export const viewport: Viewport = {
  themeColor: "#ff5e41",
  colorScheme: "light dark",
  viewportFit: "cover",
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
          <AppearanceProvider>
            <AppRegistration />
            {children}
          </AppearanceProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
