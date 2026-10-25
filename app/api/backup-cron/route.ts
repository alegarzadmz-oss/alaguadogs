import { timingSafeEqual } from "node:crypto";
import { performBackup } from "@/lib/backup/run";
import { BackupError } from "@/lib/backup/format";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
      ? `Bearer ${process.env.CRON_SECRET}`
      : "",
    actual = request.headers.get("authorization") || "";
  const a = Buffer.from(actual),
    b = Buffer.from(expected),
    headers = { "Cache-Control": "private, no-store" };
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b))
    return new Response(null, { status: 401, headers });
  try {
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Monterrey",
    }).format(new Date());
    return Response.json(await performBackup({ scheduleKey: `daily:${day}` }), {
      headers,
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof BackupError ? e.code : "backup_failed" },
      { status: 503, headers },
    );
  }
}
