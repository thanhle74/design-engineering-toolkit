// Knowledge Engine (issue #15) — record identity: ID grammar, deterministic slug derivation.
// IDs are version-free `<prefix>:<scope>:<slug>` (knowledge-foundation CONTRACTS.md §1.2); the
// upstream identifier is preserved verbatim in nativeId, never re-slugified.
export const KB_ID_PREFIXES = [
   "cap",
   "dat",
   "mod",
   "uic",
   "req",
   "uxi",
   "cmp",
   "dec",
   "apr",
   "risk",
   "oq",
   "con",
   "src",
   "rel",
] as const;

const ID_PATTERNS: { prefixes: string[]; pattern: RegExp }[] = [
   {
      prefixes: ["cap", "dat", "mod"],
      pattern: /^(cap|dat|mod):[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/,
   },
   {
      prefixes: ["uic"],
      pattern: /^uic:[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/,
   },
   {
      prefixes: ["req", "uxi", "cmp", "dec", "apr", "risk", "oq", "con", "src"],
      pattern:
         /^(req|uxi|cmp|dec|apr|risk|oq|con|src):[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/,
   },
   {
      prefixes: ["rel"],
      pattern: /^rel:[a-z0-9][a-z0-9-]*:[a-z0-9][a-z0-9-]*$/,
   },
];

export function idGrammarError(id: string): string | null {
   const prefix = id.split(":", 1)[0];
   const entry = ID_PATTERNS.find((p) => p.prefixes.includes(prefix));
   if (!entry)
      return `unknown ID prefix '${prefix}' (expected one of ${KB_ID_PREFIXES.join("/")})`;
   if (!entry.pattern.test(id)) {
      return `id '${id}' violates the '<prefix>:<scope>:<kebab-slug>' grammar for prefix '${prefix}'`;
   }
   return null;
}

// Lowercase, collapse every non-[a-z0-9] run into one hyphen, trim hyphens.
export function slugify(raw: string): string {
   return raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

// Deterministic KB-1 id from a #9 CapabilityRegistry capability:
//   scope = slugified provider (the source namespace), slug = registry-id segments after the
//   first + appearance suffix when the appearance is not "default".
// Example: provider "Vendor_CustomWidgets", id "vendor_customwidgets/component/cta_a",
// appearance "default"    ->  cap:vendor-customwidgets:component-cta-a
//          appearance "hero-wide" -> cap:vendor-customwidgets:cta-a-hero-wide
export function deriveCapabilityId(
   provider: string,
   registryId: string,
   appearanceId: string,
): string {
   const namespace = slugify(provider);
   const segments = registryId.split("/");
   const rest = segments.length > 1 ? segments.slice(1).join("/") : segments[0];
   const base = slugify(rest) || slugify(registryId);
   const slug =
      appearanceId && appearanceId !== "default"
         ? `${base}-${slugify(appearanceId)}`
         : base;
   return `cap:${namespace}:${slug}`;
}
