// Public API of the knowledge module ([68] module organization).
// The generic CLI runtime (src/core/cli) consumes the module only through this surface;
// other modules must not reach into module-internal files.
export { runIngest } from "./ingest.js";
export { runSync } from "./sync.js";
export { runQuery, type KbQueryKb, type KbQuerySpec } from "./query.js";
export { runValidate } from "./validate.js";
export { runExtract } from "./extract.js";
export {
   readDescriptor,
   readStore,
   serializeDescriptor,
   projectFile,
   STORE_FILES,
} from "./store.js";
export type { KbStoreData, StoreDescriptor } from "./types.js";
