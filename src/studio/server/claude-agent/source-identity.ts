/**
 * [65] C65-3 — verified source-identity binding for a base project.
 *
 * Node-ID membership in the pinned tree alone does NOT prove that a request
 * names the SAME Figma file the base project was derived from: unrelated
 * files have overlapping numeric node ids, and an arbitrary root id would
 * otherwise pass the locator check. The binding is an explicit, committed
 * per-project record (`source-identity.json` next to `build-config.json`)
 * carrying the verified Figma file key + root node id + the pinned provider
 * revision it was extracted from (authorized #18 read-only evidence for the
 * real-derived Slaunchpad base).
 *
 * The agent routes compare EVERY analysis/approval request against the
 * selected base's binding and FAIL CLOSED on any mismatch — a plan proposed
 * for a different Figma file can never be approved into this base project.
 * Generating a NEW pinned snapshot/project for another Figma file is
 * explicitly OUT OF SCOPE ([65]): without one, that file simply has no
 * approvable base.
 */
import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { AgentWorkflowError } from "./agent-errors";

export const SOURCE_IDENTITY_FILE = "source-identity.json";

export interface SourceIdentity {
  schemaVersion: 1;
  /** Verified Figma file key the base project was extracted from. */
  figmaFileKey: string;
  /** Verified root node id in that file (normalized `n:m`). */
  figmaRootNodeId: string;
  /** Provider revision the snapshot was pinned to (if recorded). */
  providerRevisionId: string | null;
  /** Where the verification comes from (human-auditable provenance note). */
  provenance: string;
}

interface RawSourceIdentity {
  schemaVersion?: unknown;
  figmaFileKey?: unknown;
  figmaRootNodeId?: unknown;
  providerRevisionId?: unknown;
  provenance?: unknown;
}

const FILE_KEY_PATTERN = /^[A-Za-z0-9]+$/;
const NODE_ID_PATTERN = /^(\d+):(\d+)$/;

/**
 * Read + validate `<baseConfigDir>/source-identity.json`. Returns null when
 * the file is absent (a base project with no verified Figma binding — the
 * agent workflow must refuse it rather than guess).
 */
export async function readSourceIdentity(baseConfigPath: string): Promise<SourceIdentity | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(path.dirname(baseConfigPath), SOURCE_IDENTITY_FILE), "utf8");
  } catch {
    return null;
  }
  let parsed: RawSourceIdentity;
  try {
    parsed = JSON.parse(raw) as RawSourceIdentity;
  } catch {
    return null;
  }
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.figmaFileKey !== "string" ||
    !FILE_KEY_PATTERN.test(parsed.figmaFileKey) ||
    typeof parsed.figmaRootNodeId !== "string" ||
    !NODE_ID_PATTERN.test(parsed.figmaRootNodeId) ||
    typeof parsed.provenance !== "string" ||
    parsed.provenance.trim() === ""
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    figmaFileKey: parsed.figmaFileKey,
    figmaRootNodeId: parsed.figmaRootNodeId,
    providerRevisionId:
      typeof parsed.providerRevisionId === "string" && parsed.providerRevisionId.trim() !== ""
        ? parsed.providerRevisionId
        : null,
    provenance: parsed.provenance,
  };
}

/**
 * C65-3 guard: the request's fileKey + nodeId must EQUAL the base project's
 * verified binding. Throws `base-source-mismatch` (422) with a Vietnamese
 * operator instruction; machine tokens (fileKey, nodeId, config id) stay
 * verbatim. A base without a binding fails closed as well.
 */
export async function assertRequestMatchesSourceIdentity(
  request: { fileKey: string; nodeId: string },
  baseConfigPath: string,
  baseConfigId: string
): Promise<SourceIdentity> {
  const identity = await readSourceIdentity(baseConfigPath);
  if (identity === null) {
    throw new AgentWorkflowError(
      "base-source-mismatch",
      `Cấu hình cơ sở "${baseConfigId}" chưa gắn nguồn Figma đã xác minh (thiếu ${SOURCE_IDENTITY_FILE}); workflow AI bị chặn — không phán đoán nguồn.`
    );
  }
  if (request.fileKey !== identity.figmaFileKey || request.nodeId !== identity.figmaRootNodeId) {
    throw new AgentWorkflowError(
      "base-source-mismatch",
      `Nguồn Figma (${request.fileKey}, node ${request.nodeId}) không khớp với cấu hình cơ sở ` +
        `"${baseConfigId}" (file ${identity.figmaFileKey}, root ${identity.figmaRootNodeId}). ` +
        `Phân tích và duyệt chỉ chạy trên đúng nguồn đã pin của cấu hình này.`
    );
  }
  return identity;
}
