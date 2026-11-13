// Only trust the visitor IP supplied by Cloudflare, not X-Forwarded-For.
// Block exact visitor addresses; other addresses in their subnets remain allowed.
const BLOCKED_IPS = new Set(["23.248.191.126", "211.154.195.250"]);

export function isBlockedIP(ip) {
  return BLOCKED_IPS.has((ip || "").replace(/^(?:0:0:0:0:0:ffff:|::ffff:)/i, ""));
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
