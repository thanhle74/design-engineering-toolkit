"use client";

/**
 * [29] Studio — diagnostics panel fed by run.diagnostics.
 *
 * Every carried-over diagnostic renders with its severity, code, message,
 * subject and origin (run/compose/review) as a plain list — never a table.
 * An empty diagnostics list renders a truthful "none recorded" line rather
 * than pretending silence means health.
 *
 * [61] Ant Design stock light appearance: badges are preset-color Tags, the
 * diagnostic codes are antd inline code, and the rows are `Flex` items with
 * the stock gap — no custom surfaces or colors.
 */
import { AlertOutlined } from "@ant-design/icons";
import { Card, Flex, Typography } from "antd";
import type { StudioDiagnosticView } from "@/src/modules/studio/shared/contracts";
import { OriginBadge, SeverityBadge } from "./disposition-badges";

/** "không rõ" — a fact the run does not carry is shown, never invented ([61] Vietnamese). */
const UNKNOWN = "không rõ";

function DiagnosticRow({ diagnostic }: { diagnostic: StudioDiagnosticView }) {
   return (
      <li
         style={{
            padding: "8px 0",
            borderBottom: "1px solid #f0f0f0",
            listStyle: "none",
         }}
      >
         <Flex
            wrap="wrap"
            align="center"
            gap="small"
            data-testid="diagnostic-row"
            data-severity={diagnostic.severity}
            data-origin={diagnostic.origin}
         >
            <SeverityBadge severity={diagnostic.severity} />
            {diagnostic.code && (
               <Typography.Text code type="secondary">
                  {diagnostic.code}
               </Typography.Text>
            )}
            <Typography.Text strong>{diagnostic.message}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
               subject: {diagnostic.subjectType ?? UNKNOWN}
            </Typography.Text>
            {diagnostic.subjectId && (
               <Typography.Text
                  code
                  type="secondary"
                  title={diagnostic.subjectId}
                  style={{ fontSize: 12 }}
               >
                  {diagnostic.subjectId}
               </Typography.Text>
            )}
            <OriginBadge origin={diagnostic.origin} />
         </Flex>
      </li>
   );
}

export function DiagnosticsPanel({
   diagnostics,
}: {
   diagnostics: readonly StudioDiagnosticView[];
}) {
   return (
      <section
         aria-labelledby="studio-diagnostics-heading"
         data-testid="diagnostics-panel"
      >
         <Card
            size="small"
            title={
               <Flex align="center" gap={8}>
                  <AlertOutlined style={{ color: "#fa8c16" }} />
                  <h3 style={{ margin: 0, fontSize: 14 }}>
                     Chẩn đoán kỹ thuật{" "}
                     <Typography.Text type="secondary">
                        ({diagnostics.length} bản ghi)
                     </Typography.Text>
                  </h3>
               </Flex>
            }
         >
            {diagnostics.length === 0 ? (
               <p data-testid="diagnostics-empty" style={{ margin: 0 }}>
                  <Typography.Text type="secondary">
                     Không có chẩn đoán nào được ghi cho lần chạy này.
                  </Typography.Text>
               </p>
            ) : (
               <ul style={{ margin: 0, padding: 0 }}>
                  {diagnostics.map((diagnostic, index) => (
                     <DiagnosticRow
                        diagnostic={diagnostic}
                        key={`${diagnostic.origin}-${diagnostic.code ?? "no-code"}-${index}`}
                     />
                  ))}
               </ul>
            )}
         </Card>
      </section>
   );
}
