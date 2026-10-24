import { get } from "@vercel/blob";
import { sharedReceipt } from "@/db/service-closeout";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "X-Content-Type-Options": "nosniff",
};
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return new Response(null, { status: 403, headers });
    const raw = await request.text();
    if (raw.length > 1000) return new Response(null, { status: 413, headers });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 404, headers });
    }
    if (
      body.photoId &&
      (typeof body.photoId !== "string" ||
        !/^[a-f0-9-]{36}$/.test(body.photoId))
    )
      return new Response(null, { status: 404, headers });
    const result = await sharedReceipt(body.token, body.photoId);
    if (!result)
      return Response.json(
        {
          error:
            "Este enlace venció, fue revocado o el servicio cambió. Pide un enlace actualizado a AL’AGUA DOGS.",
        },
        { status: 404, headers },
      );
    if ("pathname" in result && result.pathname) {
      const photo = await get(result.pathname, { access: "private" });
      if (!photo || photo.statusCode !== 200)
        return new Response(null, { status: 404, headers });
      return new Response(photo.stream, {
        headers: { ...headers, "Content-Type": "image/jpeg" },
      });
    }
    return Response.json(result, { headers });
  } catch {
    return Response.json(
      { error: "No se pudo abrir el recibo. Intenta de nuevo." },
      { status: 503, headers },
    );
  }
}
