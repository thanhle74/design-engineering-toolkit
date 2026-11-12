"use client";

/**
 * [29] Studio — mapping review module root (presentational; receives the run).
 *
 * Composes the review table, the diagnostics panel and the mandatory
 * provenance footer. An empty run (no mappings, no diagnostics) renders a
 * truthful EMPTY state — the provenance footer still renders so a fixture run
 * can never masquerade as live output.
 *
 * [61] Ant Design stock light appearance: the empty state is a calm info
 * Alert, the section separator an antd Divider — no custom styling.
 */
import { SearchOutlined } from "@ant-design/icons";
import { Alert, Divider, Typography } from "antd";
import type { StudioRunView } from "@/src/studio/shared/contracts";
import { DiagnosticsPanel } from "./diagnostics-panel";
import { MappingReviewTable } from "./mapping-review-table";
import { ProvenanceFooter } from "./provenance-footer";

export function MappingReview({ run }: { run: StudioRunView }) {
  const isEmpty = run.mappings.length === 0 && run.diagnostics.length === 0;
  return (
    <section
      aria-labelledby="studio-mapping-review-heading"
      data-testid="mapping-review"
    >
      <h2>
        Soát mapping{" "}
        <Typography.Text type="secondary">
          {run.mappings.length} mapping · {run.diagnostics.length} chẩn đoán
        </Typography.Text>
      </h2>
      {isEmpty ? (
        <Alert
          type="info"
          showIcon
          icon={<SearchOutlined aria-hidden="true" />}
          data-testid="mapping-review-empty"
          title="Không có node mapping hay chẩn đoán"
          description="Lần chạy này không có mapping ghép và không có chẩn đoán nào. Không có gì bị ẩn — nguồn chưa tạo ra nội dung nào để soát."
        />
      ) : (
        <>
          <MappingReviewTable mappings={run.mappings} />
          <Divider />
          <DiagnosticsPanel diagnostics={run.diagnostics} />
        </>
      )}
      <Divider />
      <ProvenanceFooter run={run} />
    </section>
  );
}
