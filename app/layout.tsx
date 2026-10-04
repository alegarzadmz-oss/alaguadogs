import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { esES } from "@clerk/localizations";

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
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      localization={esES}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <html lang="es">
        <body className="antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
