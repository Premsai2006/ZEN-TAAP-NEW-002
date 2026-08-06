/**
 * Restaurant URL slug: only lowercase a-z, 0-9, and single hyphens.
 * Apostrophes and other special characters are removed (BT's → bts).
 */
export function slugify(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[''`´]/g, "") // drop apostrophes entirely
    .replace(/[^a-z0-9]+/g, "-") // everything else → hyphen
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Live input filter: never let special characters appear in the field. */
export function slugInputValue(raw) {
  return slugify(raw);
}

export function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length >= 2 && slug.length <= 48;
}
