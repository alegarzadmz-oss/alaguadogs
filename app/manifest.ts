import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AL’AGUA DOGS · Operaciones",
    short_name: "AL’AGUA DOGS",
    description: "Administración y trabajo del día de AL’AGUA DOGS.",
    lang: "es-MX",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f9f4ee",
    theme_color: "#ff5e41",
    icons: [
      {
        src: "/app-icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/app-icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
