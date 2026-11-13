// Only trust the visitor IP supplied by Cloudflare, not X-Forwarded-For.
// Block only this visitor address; other addresses in the subnet remain allowed.
export function isBlockedIP(ip) {
  return /^(?:0:0:0:0:0:ffff:|::ffff:)?23\.248\.191\.126$/i.test(ip || "");
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
