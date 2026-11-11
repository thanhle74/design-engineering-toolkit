#!/usr/bin/env node
// det — Design Engineering Toolkit CLI shim (checkout-root compatibility wrapper, [60]).
// The implementation lives in the @det/core workspace package (packages/core), compiled by
// `npm run build` to packages/core/dist/; this committed shim keeps the historical
// `node bin/det.js` (and `npm exec det`) invocation working from the checkout root.
const entry = new URL("../packages/core/dist/src/core/cli/main.js", import.meta.url);

try {
  const { main } = await import(entry.href);
  process.exitCode = await main(process.argv.slice(2), process.env);
} catch (e) {
  if (e && e.code === "ERR_MODULE_NOT_FOUND") {
    process.stderr.write("det: compiled core not found — run `npm run build` first (dist/ is generated).\n");
    process.exit(2);
  }
  process.stderr.write(`det: ${(e && e.message) || e}\n`);
  process.exit(2);
}
