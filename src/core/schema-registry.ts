// Ajv schema registry for the det core: loads every committed schema family
// (schemas/converter + schemas/cli + schemas/kb + schemas root) once and compiles validators
// by $id or basename. schemas/registry.json (issue #41) is the single source of contract
// aliases; the schema files on disk stay the canonical contracts and carry their own $id.
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

// ---- schemas/registry.json: contract alias -> relative schema path (issue #41) ----------
// The registry JSON is the single source of contract aliases; each mapped file's own $id is
// the Ajv registry key and the serialized schemaRef identity (byte-for-byte, no URI
// migration). Resolution is alias -> path -> the schema file's own $id, read from the DET
// install/package root — never cwd, an absolute path or a network fetch.
interface RegistryDoc {
  version: number;
  aliases: Record<string, string>;
}

const REGISTRY_FILE = path.join(REPO_ROOT, "schemas", "registry.json");

let registryDoc: RegistryDoc | null = null;
const idByAlias = new Map<string, string>();

function loadRegistry(): RegistryDoc {
  if (registryDoc) return registryDoc;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
  } catch (e) {
    throw new Error(`schema registry unreadable at ${REGISTRY_FILE}: ${(e as Error).message}`);
  }
  const doc = parsed as Partial<RegistryDoc> | null;
  if (!doc || typeof doc !== "object" || doc.version !== 1 || typeof doc.aliases !== "object" || doc.aliases === null) {
    throw new Error(`schema registry malformed at ${REGISTRY_FILE}: expected {"version":1,"aliases":{"<alias>":"<relative schema path>"}}`);
  }
  if (Object.keys(doc.aliases).length === 0) {
    throw new Error(`schema registry at ${REGISTRY_FILE} declares no aliases`);
  }
  registryDoc = doc as RegistryDoc;
  return registryDoc;
}

// List the registry's contract aliases (startup sanity and tests iterate this).
export function contractAliases(): string[] {
  return Object.keys(loadRegistry().aliases);
}

// Resolve a contract alias to the schema's own $id. Throws loudly (usage error via
// assertSchemasLoad) when the alias, its file or its $id is missing or not registered.
export function contractId(name: string): string {
  const cached = idByAlias.get(name);
  if (cached !== undefined) return cached;
  const rel = loadRegistry().aliases[name];
  if (rel === undefined) throw new Error(`Unknown contract alias '${name}' (schemas/registry.json)`);
  if (path.isAbsolute(rel) || rel.includes("..") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(rel)) {
    throw new Error(`registry alias '${name}' must map to a package-relative schema path, got '${rel}'`);
  }
  const file = path.join(REPO_ROOT, rel);
  let schema: { $id?: unknown };
  try {
    schema = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`registry alias '${name}' -> unreadable schema file ${file}: ${(e as Error).message}`);
  }
  if (typeof schema.$id !== "string" || schema.$id.length === 0) {
    throw new Error(`registry alias '${name}' -> ${file} declares no $id`);
  }
  if (!getAjv().getSchema(schema.$id)) {
    throw new Error(`registry alias '${name}' -> ${file} declares $id '${schema.$id}' which is not registered in Ajv`);
  }
  idByAlias.set(name, schema.$id);
  return schema.$id;
}

export type SchemaName = string;

export function validateContract(name: string, payload: unknown): { valid: boolean; errors: string[] } {
  const ajv = getAjv();
  const id = contractId(name);
  const validate = ajv.getSchema(id);
  if (!validate) throw new Error(`Schema not registered for '${name}' (${id})`);
  const ok = validate(payload);
  const errors = ok ? [] : (validate.errors ?? []).map((e: { instancePath: string; message?: string }) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim());
  return { valid: ok, errors };
}

// First-run sanity used by CLI startup: fail loudly (usage error) if the contract layer is
// broken — including a registry alias whose path or $id is missing or mismatched (issue #41).
export function assertSchemasLoad(): void {
  loadRegistry();
  getAjv();
  for (const name of contractAliases()) validateContract(name, {});
  // Empty payloads are expected NOT to validate; we only require the schemas to compile.
}
