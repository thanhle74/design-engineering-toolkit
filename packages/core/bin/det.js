#!/usr/bin/env node
// det — Design Engineering Toolkit CLI shim. The implementation is TypeScript, compiled to
// dist/ by `npm run build`; this shim stays a tiny committed JS entrypoint so `node bin/det.js`
// (or `npm exec det`) works from a checkout without a bundler.
const entry = new URL("../dist/src/core/cli/main.js", import.meta.url);

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
