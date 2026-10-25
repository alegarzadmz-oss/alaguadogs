import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingIncludes: {
    "/api/backups": ["./scripts/schema.sql"],
    "/api/backup-cron": ["./scripts/schema.sql"],
  },
};

export default nextConfig;
