/**
 * [29] DET Studio — the ONE labeled DEMO fixture (bootstrap checkpoint).
 *
 * `demo-run.json` is shaped exactly like the frozen StudioRunView read model
 * (derived from `resources/schemas/cli/*` and `resources/schemas/converter/*`) and is validated
 * against its zod schema at import time, so any drift fails loudly instead of
 * silently skewing UI lanes.
 *
 * It is DEMO data: stable test identifiers (`demo-run-245-2`,
 * `n-[0-9a-f]{12}`, `s-[0-9a-f]{12}`), no live Figma/Magento provenance, no
 * downloadable artifact bytes, and an honest preview-unavailable state. Every
 * UI lane renders the SAME fixture; the server reader lane (W-D) swaps this
 * for real run directories without touching the shape.
 *
 * DO NOT add competing fixtures. Changes to the read model or this fixture are
 * integrator-only (shared contract freeze).
 */
import demoRunFixtureJson from "./demo-run.json";
import {
  assertStudioRunViewInvariants,
  StudioRunViewSchema,
  type StudioRunView,
} from "../contracts/studio-run-view";

const parsed: StudioRunView = StudioRunViewSchema.parse(demoRunFixtureJson);
assertStudioRunViewInvariants(parsed);

export const DEMO_RUN_FIXTURE: StudioRunView = parsed;
