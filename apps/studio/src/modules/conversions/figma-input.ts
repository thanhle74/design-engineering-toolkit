/**
 * [29] DET Studio — pure Figma input parser (New Conversion module, lane W-A).
 *
 * Accepts exactly two input forms:
 *  (a) a Figma design-file URL — `https://(www.)figma.com/design/:fileKey(/branch/:branchKey)?/:fileName?node-id=1-2`
 *      → `{ fileKey, nodeId: "1:2" }` (the `node-id` query dash becomes a colon;
 *      per Figma's own URL semantics a `/branch/:branchKey/` path uses the
 *      branchKey as the fileKey). `node-id` is REQUIRED: without a node there
 *      is nothing for the engine to extract.
 *  (b) a bare node id — `245:2` (or `245-2`, normalized to `245:2`). No file
 *      key exists in this form, so the result carries `fileKey: null`.
 *
 * Anything else fails with a stable `reason` and an operator-readable message
 * ([61] messages are natural Vietnamese; machine tokens — URLs, `node-id`,
 * `fileKey`, example ids like `245:2` — stay verbatim).
 * This helper is pure: no React, no network, no storage, no Figma API access —
 * it only parses what the operator typed.
 */
import type { FigmaInputKind } from "./types";

export type FigmaInputErrorReason =
  | "empty"
  | "not-a-figma-url"
  | "unsupported-figma-file-type"
  | "missing-file-key"
  | "missing-node-id"
  | "malformed-node-id";

export type FigmaInputParseResult =
  | {
      ok: true;
      /** Null for bare node ids — an absent file key is unknown, never invented. */
      fileKey: string | null;
      /** Normalized Figma node id, always `number:number` (e.g. `245:2`). */
      nodeId: string;
      inputKind: FigmaInputKind;
    }
  | {
      ok: false;
      reason: FigmaInputErrorReason;
      message: string;
    };

/** Figma node ids are `number:number` (URLs spell the separator as `-`). */
const NODE_ID_PATTERN = /^(\d+)[-:](\d+)$/;
/** Figma file/branch keys are alphanumeric strings (typically 22 chars). */
const FILE_KEY_PATTERN = /^[A-Za-z0-9]+$/;
const FIGMA_HOST_PATTERN = /(^|\.)figma\.com$/;
/** Figma paths that are real Figma files but NOT design-file extraction input. */
const NON_DESIGN_PATH_PREFIXES = ["/board/", "/slides/", "/make/", "/spec/", "/file/"] as const;

function failure(reason: FigmaInputErrorReason, message: string): FigmaInputParseResult {
  return { ok: false, reason, message };
}

function parseBareNodeId(trimmed: string): FigmaInputParseResult {
  const match = NODE_ID_PATTERN.exec(trimmed);
  if (!match) {
    return failure(
      "not-a-figma-url",
      "Hãy dán URL file thiết kế Figma (https://www.figma.com/design/…?node-id=1-2) hoặc một node id dạng 245:2."
    );
  }
  return { ok: true, fileKey: null, nodeId: `${match[1]}:${match[2]}`, inputKind: "bare" };
}

function parseFigmaUrl(url: URL): FigmaInputParseResult {
  if (!FIGMA_HOST_PATTERN.test(url.hostname) || !["http:", "https:"].includes(url.protocol)) {
    return failure(
      "not-a-figma-url",
      "Đây không phải URL figma.com. Hãy dán URL file thiết kế Figma hoặc một node id dạng 245:2."
    );
  }

  const path = url.pathname;
  if (!path.startsWith("/design/")) {
    if (NON_DESIGN_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return failure(
        "unsupported-figma-file-type",
        "Chỉ hỗ trợ URL file thiết kế (/design/…). Link FigJam board, slides và /file/ cũ cần được mở lại trong Figma rồi copy URL dạng design."
      );
    }
    return failure(
      "not-a-figma-url",
      "URL này không giống URL file thiết kế Figma. Dạng đúng: https://www.figma.com/design/<fileKey>/<fileName>?node-id=1-2."
    );
  }

  const segments = path.split("/").filter(Boolean);
  // segments[0] is "design"; segments[1] must be the file key.
  const fileKeySegment = segments[1];
  if (!fileKeySegment || !FILE_KEY_PATTERN.test(fileKeySegment)) {
    return failure(
      "missing-file-key",
      "URL không có file key sau /design/. Hãy mở file trong Figma và copy lại URL từ trình soạn thảo."
    );
  }

  // Branch URLs: /design/:fileKey/branch/:branchKey/:fileName — the branchKey
  // identifies the file that would actually be extracted.
  let fileKey = fileKeySegment;
  if (segments[2] === "branch") {
    const branchKey = segments[3];
    if (!branchKey || !FILE_KEY_PATTERN.test(branchKey)) {
      return failure(
        "missing-file-key",
        "URL branch không có branch key sau /branch/. Hãy copy URL từ chế độ xem branch trong Figma."
      );
    }
    fileKey = branchKey;
  }

  const rawNodeId = url.searchParams.get("node-id");
  if (rawNodeId === null) {
    return failure(
      "missing-node-id",
      "URL thiếu tham số node-id. Hãy chọn frame trong Figma để URL có kèm ?node-id=… (ví dụ node-id=245-2)."
    );
  }
  // URLSearchParams already decodes %3A, so both ?node-id=245-2 and ?node-id=245%3A2 land here.
  const match = NODE_ID_PATTERN.exec(rawNodeId.trim());
  if (!match) {
    return failure(
      "malformed-node-id",
      "Tham số node-id phải có dạng 1-2 hoặc 1:2 (số, ngăn cách bởi dấu gạch ngang hoặc dấu hai chấm)."
    );
  }

  return { ok: true, fileKey, nodeId: `${match[1]}:${match[2]}`, inputKind: "url" };
}

/**
 * Parse a Figma design source: full design-file URL with a required `node-id`,
 * or a bare node id. Never touches the network and never validates that the
 * file/node actually exist — that is [28]'s engine bridge, which is not
 * connected in this MVP.
 */
export function parseFigmaInput(raw: string): FigmaInputParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return failure("empty", "Hãy nhập URL file thiết kế Figma hoặc một node id dạng 245:2.");
  }

  if (NODE_ID_PATTERN.test(trimmed)) {
    return parseBareNodeId(trimmed);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return failure(
      "not-a-figma-url",
      "Hãy dán URL file thiết kế Figma (https://www.figma.com/design/…?node-id=1-2) hoặc một node id dạng 245:2."
    );
  }
  return parseFigmaUrl(url);
}
