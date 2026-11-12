// Shared test-infra helper ([68] module-owned suites): resolves the checkout root by walking
// up to the nearest package.json from this file's location. Suites import { REPO_ROOT }
// instead of hardcoding ".." depth, so a suite keeps working when its owning module moves.
// Contains no test cases and no domain logic.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let root = path.dirname(fileURLToPath(import.meta.url));
while (!fs.existsSync(path.join(root, "package.json"))) {
  const parent = path.dirname(root);
  if (parent === root) throw new Error(`checkout root not found: no package.json above ${root}`);
  root = parent;
}
export const REPO_ROOT = root;
