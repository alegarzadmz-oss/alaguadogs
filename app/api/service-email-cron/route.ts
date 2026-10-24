import { timingSafeEqual } from "node:crypto";
import { processPendingServiceEmails } from "@/db/service-email";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
      ? `Bearer ${process.env.CRON_SECRET}`
      : "",
    actual = request.headers.get("authorization") || "";
  const headers = { "Cache-Control": "private, no-store" };
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !timingSafeEqual(a, b))
    return new Response(null, { status: 401, headers });
  try {
    return Response.json(await processPendingServiceEmails(), { headers });
  } catch {
    return Response.json(
      { error: "No se completó la revisión de correos pendientes." },
      { status: 503, headers },
    );
  }
}
