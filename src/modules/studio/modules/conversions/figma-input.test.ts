import { describe, expect, it } from "vitest";

import { parseFigmaInput } from "./figma-input";

describe("parseFigmaInput — valid input", () => {
  it("parses a full design URL with a dash node-id", () => {
    const result = parseFigmaInput(
      "https://www.figma.com/design/AbC123xyzQrs/My%20Design%20File?node-id=245-2"
    );
    expect(result).toEqual({
      ok: true,
      fileKey: "AbC123xyzQrs",
      nodeId: "245:2",
      inputKind: "url",
    });
  });

  it("parses a URL whose node-id is already colon-encoded (%3A)", () => {
    const result = parseFigmaInput(
      "https://figma.com/design/FILEKEY01/Name?node-id=1%3A2&x=y"
    );
    expect(result).toEqual({ ok: true, fileKey: "FILEKEY01", nodeId: "1:2", inputKind: "url" });
  });

  it("uses the branchKey as the fileKey for branch URLs", () => {
    const result = parseFigmaInput(
      "https://www.figma.com/design/BaseKey00/branch/BranchKey1/Name?node-id=3-4"
    );
    expect(result).toEqual({ ok: true, fileKey: "BranchKey1", nodeId: "3:4", inputKind: "url" });
  });

  it("accepts a design URL without a fileName segment", () => {
    const result = parseFigmaInput("https://www.figma.com/design/FILEKEY01?node-id=10-20");
    expect(result).toEqual({ ok: true, fileKey: "FILEKEY01", nodeId: "10:20", inputKind: "url" });
  });

  it("parses a bare colon node id", () => {
    expect(parseFigmaInput("245:2")).toEqual({
      ok: true,
      fileKey: null,
      nodeId: "245:2",
      inputKind: "bare",
    });
  });

  it("normalizes a bare dash node id to the colon form", () => {
    expect(parseFigmaInput("245-2")).toMatchObject({ ok: true, nodeId: "245:2", inputKind: "bare" });
  });

  it("ignores surrounding whitespace", () => {
    expect(parseFigmaInput("  245:2  ")).toMatchObject({ ok: true, nodeId: "245:2" });
  });
});

describe("parseFigmaInput — invalid input", () => {
  it("rejects empty input", () => {
    expect(parseFigmaInput("   ")).toMatchObject({ ok: false, reason: "empty" });
    expect(parseFigmaInput("")).toMatchObject({ ok: false, reason: "empty" });
  });

  it("rejects plain garbage with the not-a-figma-url reason", () => {
    const result = parseFigmaInput("hello world, convert this please");
    expect(result).toMatchObject({ ok: false, reason: "not-a-figma-url" });
    expect(result.ok === false && result.message).toBeTruthy();
  });

  it("rejects non-figma hosts", () => {
    expect(
      parseFigmaInput("https://example.com/design/FILEKEY01/Name?node-id=1-2")
    ).toMatchObject({ ok: false, reason: "not-a-figma-url" });
  });

  it("rejects a design URL missing the node-id parameter", () => {
    const result = parseFigmaInput("https://www.figma.com/design/FILEKEY01/Name");
    expect(result).toMatchObject({ ok: false, reason: "missing-node-id" });
    expect(result.ok === false && result.message).toMatch(/node-id/);
  });

  it("rejects a malformed node-id parameter", () => {
    const result = parseFigmaInput("https://www.figma.com/design/FILEKEY01/Name?node-id=abc");
    expect(result).toMatchObject({ ok: false, reason: "malformed-node-id" });
    expect(result.ok === false && result.message).toMatch(/dạng 1-2 hoặc 1:2/);
  });

  it("rejects a design URL without a file key", () => {
    expect(parseFigmaInput("https://www.figma.com/design/?node-id=1-2")).toMatchObject({
      ok: false,
      reason: "missing-file-key",
    });
  });

  it("rejects non-design Figma file types (board/slides/legacy /file/)", () => {
    expect(parseFigmaInput("https://www.figma.com/board/KEY123/Name?node-id=1-2")).toMatchObject({
      ok: false,
      reason: "unsupported-figma-file-type",
    });
    expect(parseFigmaInput("https://www.figma.com/slides/KEY123/Name?node-id=1-2")).toMatchObject({
      ok: false,
      reason: "unsupported-figma-file-type",
    });
    expect(parseFigmaInput("https://www.figma.com/file/KEY123/Name?node-id=1-2")).toMatchObject({
      ok: false,
      reason: "unsupported-figma-file-type",
    });
  });

  it("rejects a bare node-id-shaped string with extra text", () => {
    expect(parseFigmaInput("node 245:2")).toMatchObject({ ok: false, reason: "not-a-figma-url" });
  });
});
