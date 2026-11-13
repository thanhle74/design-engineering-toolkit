"use client";

/**
 * [70] The ONE-click Build screen (rework of the [40]/[61] manual catalog
 * launcher): paste a Figma URL → one Build button → the six truthful frozen
 * stages → results. Client orchestration is honest at every step:
 *  - Readiness comes from the frozen `useStudioReadiness()` hook; UI state is
 *    never authorization — every mutation re-checks server-side (503
 *    `environment-not-ready` renders the checks + a Kiểm tra action).
 *  - The flow starts with POST /api/build-flow and is polled every 2s until a
 *    terminal state. 409 `flow-busy` ADOPTS the active snapshot (the operator
 *    sees the running flow, not a dead end); page reload resumes it via
 *    GET /api/build-flow.
 *  - `?analysis=<id>` deep links (the /agent redirect target) prefill the
 *    source and render a compact read-only analysis summary — there is NO
 *    plan-approval step any more; Build runs the full pipeline.
 *  - Errors render machine codes verbatim with the server's message; nothing
 *    is ever reinterpreted as success.
 *
 * Readiness context: the provider is mounted GLOBALLY by `app/layout.tsx`
 * (W-A's [70] shell commit) so the header cluster and this screen share one
 * context and one `GET /api/environment`; this screen only consumes the
 * frozen `useStudioReadiness()` hook. If this module is ever replayed onto a
 * tree without that layout mount, wrap `BuildScreenInner` in
 * `StudioReadinessProvider` again — one line, and the screen is
 * self-sufficient.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircleOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Flex, Row, Steps, Typography } from "antd";

import type {
   BuildFlowRunSnapshot,
   StudioReadinessChecks,
} from "@/src/modules/studio/shared/contracts/build-flow";
import type { AgentAnalysisSnapshot } from "@/src/modules/studio/shared/contracts";
import { useStudioReadiness } from "@/src/modules/studio/readiness";

import { AnalysisSummaryCard } from "../components/analysis-summary-card";
import {
   ANALYSIS_ID_PATTERN,
   DEMO_FIGMA_SOURCE,
   POLL_INTERVAL_MS,
   figmaUrlFromRequest,
   isLiveFlowState,
} from "../components/build-flow-view";
import { BuildLaunchForm } from "../components/build-launch-form";
import { BuildPipeline } from "../components/build-pipeline";

interface FlowErrorPayload {
   code: string;
   message: string;
   /** 503 `environment-not-ready` carries the server-side checks. */
   checks: StudioReadinessChecks | null;
}

interface ActiveFlowPayload {
   active: BuildFlowRunSnapshot | null;
}

interface FlowStartPayload {
   flowId: string;
   state: string;
}

interface AnalysisPayload {
   snapshot: AgentAnalysisSnapshot;
   plan: unknown;
   approval: unknown;
}

async function readErrorPayload(
   response: Response,
): Promise<FlowErrorPayload | null> {
   try {
      const body = (await response.json()) as {
         error?: { code?: string; message?: string };
         checks?: StudioReadinessChecks;
      };
      if (body.error === undefined) return null;
      return {
         code: body.error.code ?? "unknown",
         message: body.error.message ?? "",
         checks: body.checks ?? null,
      };
   } catch {
      return null;
   }
}

function BuildScreenInner() {
   const readiness = useStudioReadiness();
   const [sourceInput, setSourceInput] = useState(DEMO_FIGMA_SOURCE);
   const [activeFlowId, setActiveFlowId] = useState<string | null>(null);
   const [snapshot, setSnapshot] = useState<BuildFlowRunSnapshot | null>(null);
   const [starting, setStarting] = useState(false);
   const [launchError, setLaunchError] = useState<FlowErrorPayload | null>(
      null,
   );
   const [busyNote, setBusyNote] = useState<string | null>(null);
   const [cancelPending, setCancelPending] = useState(false);
   const [cancelNote, setCancelNote] = useState<string | null>(null);

   const [analysisId, setAnalysisId] = useState<string | null>(null);
   const [analysisLoading, setAnalysisLoading] = useState(false);
   const [analysisSnapshot, setAnalysisSnapshot] =
      useState<AgentAnalysisSnapshot | null>(null);

   const loadFlow = useCallback(async (flowId: string): Promise<void> => {
      try {
         const response = await fetch(
            `/api/build-flow/${encodeURIComponent(flowId)}`,
            { cache: "no-store" },
         );
         if (response.status === 404) {
            const payload = await readErrorPayload(response);
            setActiveFlowId(null);
            setSnapshot(null);
            setLaunchError(
               payload ?? {
                  code: "flow-not-found",
                  message: "Không còn đọc được luồng Build này.",
                  checks: null,
               },
            );
            return;
         }
         if (!response.ok) return; // transient — the poll loop retries
         setSnapshot((await response.json()) as BuildFlowRunSnapshot);
      } catch {
         /* transient network failure — the poll loop retries */
      }
   }, []);

   const loadAnalysis = useCallback(async (id: string): Promise<void> => {
      setAnalysisLoading(true);
      try {
         const response = await fetch(
            `/api/agent/analyses/${encodeURIComponent(id)}`,
            { cache: "no-store" },
         );
         if (!response.ok) {
            setAnalysisSnapshot(null);
            return;
         }
         const payload = (await response.json()) as AnalysisPayload;
         setAnalysisSnapshot(payload.snapshot);
         // Deep-link prefill: the analysis request back-spelled as a design
         // URL (only a request that actually carries a file key).
         setSourceInput(
            figmaUrlFromRequest(
               payload.snapshot.request.fileKey,
               payload.snapshot.request.nodeId,
            ),
         );
      } catch {
         setAnalysisSnapshot(null);
      } finally {
         setAnalysisLoading(false);
      }
   }, []);

   // Mount bootstrap: resume any active flow + honor ?analysis= (deferred one
   // tick, same shape as the [65] workflow — no setState in the mount effect).
   useEffect(() => {
      const bootstrap = window.setTimeout(() => {
         void (async () => {
            try {
               const response = await fetch("/api/build-flow", {
                  cache: "no-store",
               });
               if (!response.ok) return;
               const payload = (await response.json()) as ActiveFlowPayload;
               if (payload.active !== null) {
                  setSnapshot(payload.active);
                  setActiveFlowId(payload.active.flowId);
               }
            } catch {
               /* first paint stays empty; Build starts a fresh flow */
            }
            const searchParams = new URLSearchParams(window.location.search);
            const sourceParam = searchParams.get("source");
            if (sourceParam && sourceParam.trim() !== "") {
               setSourceInput(sourceParam.trim());
            }
            const deep = searchParams.get("analysis");
            if (deep !== null && ANALYSIS_ID_PATTERN.test(deep)) {
               setAnalysisId(deep);
               void loadAnalysis(deep);
            }
         })();
      }, 0);
      return () => window.clearTimeout(bootstrap);
   }, [loadAnalysis]);

   // Poll every 2s while the adopted flow is live (also covers the window
   // between a 202 and the first snapshot: activeFlowId set, snapshot null).
   const snapshotForActiveFlow =
      snapshot !== null && snapshot.flowId === activeFlowId ? snapshot : null;
   const live =
      activeFlowId !== null &&
      (snapshotForActiveFlow === null ||
         isLiveFlowState(snapshotForActiveFlow.state));
   useEffect(() => {
      if (activeFlowId === null || !live) return;
      const timer = setInterval(() => {
         void loadFlow(activeFlowId);
      }, POLL_INTERVAL_MS);
      return () => clearInterval(timer);
   }, [activeFlowId, live, loadFlow]);

   const startBuild = useCallback(
      (figmaInput: string): void => {
         setLaunchError(null);
         setBusyNote(null);
         setCancelNote(null);
         void (async () => {
            setStarting(true);
            try {
               const response = await fetch("/api/build-flow", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                     figmaInput,
                     target: "magento-page-builder",
                  }),
               });
               if (response.status === 202) {
                  const payload = (await response.json()) as FlowStartPayload;
                  setSnapshot(null);
                  setActiveFlowId(payload.flowId);
                  await loadFlow(payload.flowId);
                  return;
               }
               if (response.status === 409) {
                  const payload = (await response.json().catch(() => null)) as {
                     error?: { code?: string; message?: string };
                     active?: BuildFlowRunSnapshot | null;
                  } | null;
                  const active = payload?.active ?? null;
                  if (active !== null) {
                     setSnapshot(active);
                     setActiveFlowId(active.flowId);
                     setBusyNote(
                        "Đã có luồng Build đang chạy — hiển thị trạng thái thật của luồng đó.",
                     );
                  } else {
                     setBusyNote(
                        payload?.error?.message ??
                           "Đã có luồng Build khác đang chạy.",
                     );
                  }
                  return;
               }
               const payload = await readErrorPayload(response);
               setLaunchError(
                  payload ?? {
                     code: "internal-error",
                     message: `Khởi chạy luồng Build thất bại (HTTP ${response.status}).`,
                     checks: null,
                  },
               );
            } catch {
               setLaunchError({
                  code: "network",
                  message: "Không gọi được máy chủ Studio.",
                  checks: null,
               });
            } finally {
               setStarting(false);
            }
         })();
      },
      [loadFlow],
   );

   const cancelFlow = useCallback((): void => {
      if (activeFlowId === null) return;
      void (async () => {
         setCancelPending(true);
         setCancelNote(null);
         try {
            const response = await fetch(
               `/api/build-flow/${encodeURIComponent(activeFlowId)}/cancel`,
               { method: "POST" },
            );
            if (response.ok) {
               const payload = (await response.json()) as {
                  snapshot: BuildFlowRunSnapshot;
               };
               setSnapshot(payload.snapshot);
               return;
            }
            const payload = await readErrorPayload(response);
            setCancelNote(
               payload === null
                  ? `Không hủy được luồng Build (HTTP ${response.status}).`
                  : `${payload.message} (mã: ${payload.code})`,
            );
         } catch {
            setCancelNote("Không gọi được máy chủ Studio để hủy.");
         } finally {
            setCancelPending(false);
         }
      })();
   }, [activeFlowId]);

   const rerun = useCallback((): void => {
      setSnapshot(null);
      setActiveFlowId(null);
      setLaunchError(null);
      setBusyNote(null);
      setCancelNote(null);
      startBuild(sourceInput);
   }, [startBuild, sourceInput]);

   const busy = starting || live;

   return (
      <Flex vertical gap={32}>
         <section aria-labelledby="build-heading">
            <Flex align="center" gap={8}>
               {/* layout only: neutralize UA heading margins */}
               <h1 id="build-heading" style={{ margin: 0 }}>
                  Bản dựng
               </h1>
            </Flex>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
               Một cú Build chạy trọn quy trình: xác thực nguồn → đọc thiết kế →
               AI phân tích → mapping → sinh Page Builder → kết quả.
            </Typography.Paragraph>
         </section>

         <Row gutter={[24, 24]}>
            <Col xs={24} lg={15}>
               <Card size="small">
                  <BuildLaunchForm
                     sourceInput={sourceInput}
                     onSourceInputChange={setSourceInput}
                     busy={busy}
                     starting={starting}
                     onBuild={startBuild}
                  />
               </Card>
            </Col>
            <Col xs={24} lg={9}>
               <Flex vertical gap={16}>
                  <Card
                     size="small"
                     title={
                        <Flex align="center" gap={8}>
                           <ThunderboltOutlined style={{ color: "#fa8c16" }} />
                           <span style={{ fontWeight: 600 }}>
                              Trang mẫu có sẵn (Quick Presets)
                           </span>
                        </Flex>
                     }
                  >
                     <Typography.Paragraph
                        type="secondary"
                        style={{ fontSize: 13, marginBottom: 12 }}
                     >
                        Chọn nhanh một trang đã xác thực trong dự án Slaunchpad
                        Fashion để chạy thử nghiệm:
                     </Typography.Paragraph>
                     <Flex vertical gap={8}>
                        <Button
                           block
                           style={{
                              textAlign: "left",
                              height: "auto",
                              padding: "8px 12px",
                           }}
                           onClick={() =>
                              setSourceInput(
                                 "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/slaunchpad-home?node-id=245-2",
                              )
                           }
                           disabled={busy || starting}
                        >
                           <Flex vertical align="flex-start" gap={2}>
                              <Typography.Text strong style={{ fontSize: 13 }}>
                                 Homepage — Hero &amp; Craftsmanship
                              </Typography.Text>
                              <Typography.Text
                                 type="secondary"
                                 code
                                 style={{ fontSize: 11 }}
                              >
                                 node-id=245-2 (12 sections, 2 composed)
                              </Typography.Text>
                           </Flex>
                        </Button>
                        <Button
                           block
                           style={{
                              textAlign: "left",
                              height: "auto",
                              padding: "8px 12px",
                           }}
                           onClick={() =>
                              setSourceInput(
                                 "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/slaunchpad-home?node-id=245-16",
                              )
                           }
                           disabled={busy || starting}
                        >
                           <Flex vertical align="flex-start" gap={2}>
                              <Typography.Text strong style={{ fontSize: 13 }}>
                                 Homepage — Extended Sections
                              </Typography.Text>
                              <Typography.Text
                                 type="secondary"
                                 code
                                 style={{ fontSize: 11 }}
                              >
                                 node-id=245-16 (bản mở rộng)
                              </Typography.Text>
                           </Flex>
                        </Button>
                        <Button
                           block
                           style={{
                              textAlign: "left",
                              height: "auto",
                              padding: "8px 12px",
                           }}
                           onClick={() =>
                              setSourceInput(
                                 "https://www.figma.com/design/vNPtfBRpYM3PsExirVqhmt/slaunchpad-home?node-id=301-4",
                              )
                           }
                           disabled={busy || starting}
                        >
                           <Flex vertical align="flex-start" gap={2}>
                              <Typography.Text strong style={{ fontSize: 13 }}>
                                 Product Listing Page (PLP)
                              </Typography.Text>
                              <Typography.Text
                                 type="secondary"
                                 code
                                 style={{ fontSize: 11 }}
                              >
                                 node-id=301-4 (Hyvä PHTML)
                              </Typography.Text>
                           </Flex>
                        </Button>
                     </Flex>
                  </Card>

                  <Card
                     size="small"
                     title={
                        <Flex align="center" gap={8}>
                           <CheckCircleOutlined style={{ color: "#52c41a" }} />
                           <span style={{ fontWeight: 600 }}>
                              Quy trình chuyển đổi 6 bước
                           </span>
                        </Flex>
                     }
                  >
                     <Steps
                        size="small"
                        orientation="vertical"
                        current={-1}
                        items={[
                           {
                              title: "1. Xác thực nguồn",
                              content:
                                 "Kiểm tra node-id và phân tích quyền truy cập",
                           },
                           {
                              title: "2. Đọc thiết kế",
                              content:
                                 "Bóc tách cây layer sang cấu trúc chuẩn (NodeIR)",
                           },
                           {
                              title: "3. AI phân tích",
                              content: "Phát hiện ngữ nghĩa và bố cục các khối",
                           },
                           {
                              title: "4. Chuẩn hóa & Mapping",
                              content:
                                 "Ánh xạ sang Page Builder rows & columns",
                           },
                           {
                              title: "5. Sinh Page Builder",
                              content:
                                 "Biên dịch mã HTML và script cài đặt PHP",
                           },
                           {
                              title: "6. Kết quả",
                              content: "Sẵn sàng copy hoặc tải gói cài đặt",
                           },
                        ]}
                     />
                  </Card>
               </Flex>
            </Col>
         </Row>

         {launchError !== null ? (
            <Alert
               type={launchError.code === "network" ? "warning" : "error"}
               showIcon
               title={
                  launchError.checks !== null
                     ? "Môi trường chưa sẵn sàng (mã: environment-not-ready)"
                     : launchError.code === "network"
                       ? "Lỗi kết nối"
                       : `Khởi chạy luồng Build thất bại (mã: ${launchError.code})`
               }
               description={
                  <Flex vertical gap={8}>
                     <Typography.Text>{launchError.message}</Typography.Text>
                     {launchError.checks !== null ? (
                        <Flex vertical gap={2}>
                           {(
                              ["claudeCode", "figmaMcp", "detRunsDir"] as const
                           ).map((key) => {
                              const check = launchError.checks?.[key];
                              if (check === undefined) return null;
                              return (
                                 <Typography.Text key={key} type="secondary">
                                    <Typography.Text code>
                                       {key}
                                    </Typography.Text>
                                    {": "}
                                    {check.ready
                                       ? "sẵn sàng"
                                       : `chưa sẵn sàng (mã: ${check.reasonCode})`}
                                 </Typography.Text>
                              );
                           })}
                        </Flex>
                     ) : null}
                  </Flex>
               }
               action={
                  launchError.checks !== null ? (
                     <Flex align="center" gap={8} wrap="wrap">
                        <Button size="small" onClick={readiness.recheck}>
                           Kiểm tra
                        </Button>
                        <Typography.Text type="secondary">
                           Server là bên quyết định — không phải trạng thái UI.
                        </Typography.Text>
                     </Flex>
                  ) : undefined
               }
            />
         ) : null}

         {busyNote !== null ? (
            <Typography.Text type="secondary">{busyNote}</Typography.Text>
         ) : null}

         {analysisId !== null ? (
            <AnalysisSummaryCard
               analysisId={analysisId}
               snapshot={analysisSnapshot}
               loading={analysisLoading}
            />
         ) : null}

         {snapshot !== null ? (
            <BuildPipeline
               snapshot={snapshot}
               cancelPending={cancelPending}
               cancelNote={cancelNote}
               onCancel={cancelFlow}
               onRerun={rerun}
            />
         ) : null}
      </Flex>
   );
}

export function BuildScreen() {
   return <BuildScreenInner />;
}
