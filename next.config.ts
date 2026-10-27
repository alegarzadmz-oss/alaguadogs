import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          { key: "Service-Worker-Allowed", value: "/" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'; object-src 'none'",
          },
        ],
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/backups": ["./scripts/schema.sql"],
    "/api/backup-cron": ["./scripts/schema.sql"],
  },
};

export default nextConfig;
