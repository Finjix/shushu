// Only trust the visitor IP supplied by Cloudflare, not X-Forwarded-For.
// 23.248.190.0/23 includes both endpoints (512 IPv4 addresses).
export function isBlockedIP(ip) {
  const match = /^(?:0:0:0:0:0:ffff:|::ffff:)?23\.248\.(190|191)\.(0|[1-9]\d{0,2})$/i.exec(ip || "");
  return Boolean(match && Number(match[2]) <= 255);
}

export function onRequest({ request, next }) {
  if (isBlockedIP(request.headers.get("CF-Connecting-IP"))) {
    return new Response(request.method === "HEAD" ? null : "Forbidden\n", {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  }
  return next();
}
