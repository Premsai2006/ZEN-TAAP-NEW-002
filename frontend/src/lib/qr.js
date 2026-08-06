/**
 * Build the customer ordering URL encoded in a table QR.
 * Prefer REACT_APP_QR_DOMAIN; fall back to the current origin (local/dev).
 * Always ends as: {origin}/r/{slug}?table={n}
 */
export function qrOrderBase() {
  const fromEnv = (process.env.REACT_APP_QR_DOMAIN || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://zentaapqr.com";
}

export function restaurantOrderUrl(slug, tableN) {
  const s = (slug || "").trim().toLowerCase();
  const base = qrOrderBase();
  if (!s) return `${base}/login`;
  const n = Number(tableN);
  if (!Number.isFinite(n) || n <= 0) return `${base}/r/${encodeURIComponent(s)}`;
  return `${base}/r/${encodeURIComponent(s)}?table=${n}`;
}
