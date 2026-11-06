// Ajv schema registry for the det core: loads every committed schema family
// (schemas/converter + schemas/cli) once and compiles validators by $id or basename.
// The schema files on disk stay the canonical contracts; this module only registers them.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AjvDefault from "ajv/dist/2020.js";

// ajv's draft-2020 entry exports its class through a CJS interop surface that TypeScript's
// NodeNext resolution sees as a namespace, not a constructor; narrow it to the API we use.
interface AjvInstance {
  addSchema(schema: unknown): void;
  addFormat(name: string, format: RegExp | Record<string, unknown>): void;
  getSchema(id: string): (ValidateFunction | undefined);
}
interface ValidateFunction {
  (data: unknown): boolean;
  errors?: { instancePath: string; message?: string }[] | null;
}
const Ajv = AjvDefault as unknown as new (options?: Record<string, unknown>) => AjvInstance;

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const SCHEMA_DIRS = [path.join(REPO_ROOT, "schemas", "converter"), path.join(REPO_ROOT, "schemas", "cli"), path.join(REPO_ROOT, "schemas", "kb"), path.join(REPO_ROOT, "schemas")];

let instance: AjvInstance | null = null;

// ajv strict mode rejects "format": "date-time" without a registered checker; the repo
// deliberately ships no ajv-formats (schemas/converter tests established this checker).
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function getAjv(): AjvInstance {
  if (instance) return instance;
  const ajv = new Ajv({ strict: true, allErrors: true, allowUnionTypes: true });
  ajv.addFormat("date-time", DATE_TIME_RE);
  const files = SCHEMA_DIRS.flatMap((dir) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.endsWith(".schema.json") || f === "common.defs.json").map((f) => path.join(dir, f))
      : []
  );
  for (const f of files) {
    const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
    ajv.addSchema(parsed); // each file carries its absolute $id; cross-family refs resolve by $id
  }
  instance = ajv;
  return ajv;
}

const ids = new Map<string, string>([
  ["capability-registry", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/capability-registry.schema.json"],
  ["component-binding-map", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/component-binding-map.schema.json"],
  ["converter-profile", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/converter-profile.schema.json"],
  ["resolution-report", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/resolution-report.schema.json"],
  ["adapter-descriptor", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/adapter-descriptor.schema.json"],
  ["adapter-input", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/adapter-input.schema.json"],
  ["tool-run", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/tool-run.schema.json"],
  ["node-ir", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/node-ir.schema.json"],
  ["page-structure", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/page-structure.schema.json"],
  ["source-review", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/converter/source-review.schema.json"],
  ["design-source-snapshot", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/design-source-snapshot.schema.json"],
  // Native content composition family (issue #23)
  ["content-manifest", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/content-manifest.schema.json"],
  ["compose-input", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/compose-input.schema.json"],
  ["compose-output", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/compose-output.schema.json"],
  ["semantic-projection", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/cli/semantic-projection.schema.json"],
  // Knowledge Engine family (issue #15)
  ["kb-capability", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-capability.schema.json"],
  ["kb-ui-component", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-ui-component.schema.json"],
  ["kb-project-record", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-project-record.schema.json"],
  ["kb-relations", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-relations.schema.json"],
  ["kb-ingest-manifest", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-ingest-manifest.schema.json"],
  ["kb-store", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-store.schema.json"],
  ["kb-engine-output", "https://raw.githubusercontent.com/thanhle74/design-engineering-toolkit/main/schemas/kb/kb-engine-output.schema.json"],
]);

export type SchemaName = keyof typeof ids extends string ? string : never;

export function validateContract(name: string, payload: unknown): { valid: boolean; errors: string[] } {
  const ajv = getAjv();
  const id = ids.get(name);
  if (!id) throw new Error(`Unknown contract name '${name}'`);
  const validate = ajv.getSchema(id) ?? ajv.getSchema(`${id}`);
  if (!validate) throw new Error(`Schema not registered for '${name}' (${id})`);
  const ok = validate(payload);
  const errors = ok ? [] : (validate.errors ?? []).map((e: { instancePath: string; message?: string }) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
  return { valid: ok, errors };
}

// First-run sanity used by CLI startup: fail loudly (usage error) if the contract layer is broken.
export function assertSchemasLoad(): void {
  getAjv();
  for (const name of ids.keys()) validateContract(name, {});
  // Empty payloads are expected NOT to validate; we only require the schemas to compile.
}
