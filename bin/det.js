#!/usr/bin/env node
// det — Design Engineering Toolkit CLI entrypoint ([63] single application).
// The engine is the headless core module compiled by `npm run build` (tsconfig.core.json)
// to <root>/dist/; this committed shim keeps the historical `node bin/det.js`
// (and `npm exec det`) invocation working from the checkout root — and from any cwd,
// because every path the compiled core resolves anchors to this repository root,
// never to the caller's cwd.
const entry = new URL("../dist/src/core/cli/main.js", import.meta.url);

try {
   const { main } = await import(entry.href);
   process.exitCode = await main(process.argv.slice(2), process.env);
} catch (e) {
   if (e && e.code === "ERR_MODULE_NOT_FOUND") {
      process.stderr.write(
         "det: compiled core not found — run `npm run build` first (dist/ is generated).\n",
      );
      process.exit(2);
   }
   process.stderr.write(`det: ${(e && e.message) || e}\n`);
   process.exit(2);
}
