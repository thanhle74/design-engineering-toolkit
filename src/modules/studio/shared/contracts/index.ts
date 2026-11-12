/**
 * [29] DET Studio — frozen shared contracts barrel (bootstrap checkpoint).
 *
 * Canonical import paths published to workers in issue #29:
 *   import type { StudioRunView } from "@/src/modules/studio/shared/contracts";
 *   import { StudioRunViewSchema, assertStudioRunViewInvariants } from "@/src/modules/studio/shared/contracts";
 *   import type { DetRunReader, DetRunReaderError } from "@/src/modules/studio/shared/contracts";
 *   import { DEMO_RUN_FIXTURE } from "@/src/modules/studio/shared/fixtures/demo-run";
 *
 * Workers must NOT redefine competing types, duplicate fixture data, or edit
 * anything under src/shared/** — request integrator changes instead.
 */
export * from "./studio-run-view";
export * from "./det-run-reader";
export * from "./agent-plan";
