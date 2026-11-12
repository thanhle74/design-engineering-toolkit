"use client";

/**
 * [70] The one-click launch block: Figma source input (validated instantly by
 * the pure `parseFigmaInput`), the frozen output-target Select (only
 * `magento-page-builder` enabled; `hyva-phtml` honestly disabled) and the ONE
 * Build button gated on input validity AND environment readiness. Readiness
 * comes from the frozen `useStudioReadiness()` hook — UI state is never
 * authorization; the server re-checks every mutation itself (a stale-ready
 * client can still receive 503 `environment-not-ready`, rendered as an Alert
 * by the screen).
 */
import { useMemo } from "react";
import { CheckCircleOutlined } from "@ant-design/icons";
import { Button, Flex, Input, Select, Tooltip, Typography } from "antd";

import { parseFigmaInput } from "@/src/modules/studio/conversions/figma-input";
import { useStudioReadiness } from "@/src/modules/studio/readiness";

import { DEMO_SOURCE_HINT, readinessGate } from "./build-flow-view";

const SOURCE_INPUT_ID = "build-figma-source";

export interface BuildLaunchFormProps {
   sourceInput: string;
   onSourceInputChange: (value: string) => void;
   /** A flow is starting or live — the ONE-flow rule blocks a second Build. */
   busy: boolean;
   starting: boolean;
   onBuild: (figmaInput: string) => void;
}

export function BuildLaunchForm({
   sourceInput,
   onSourceInputChange,
   busy,
   starting,
   onBuild,
}: BuildLaunchFormProps) {
   const readiness = useStudioReadiness();
   const gate = readinessGate(
      readiness.status,
      readiness.checking,
      readiness.error,
   );

   const parsed = useMemo(() => parseFigmaInput(sourceInput), [sourceInput]);
   // An empty pristine input stays quiet (hint only); any non-empty invalid
   // input shows the parser's Vietnamese message verbatim.
   const parseFeedback =
      parsed.ok || sourceInput.trim() === "" ? null : parsed.message;

   const inputBlocked = !parsed.ok;
   const buildDisabled = inputBlocked || gate.blocked || busy || starting;

   const buildTooltip = inputBlocked
      ? "Nhập URL Figma (kèm node-id) hoặc một node id dạng 245:2 hợp lệ trước."
      : gate.blocked
        ? gate.detail
        : busy
          ? "Đã có một luồng Build đang chạy — mỗi lần chỉ chạy một."
          : undefined;

   const options = useMemo(
      () => [
         { value: "magento-page-builder", label: "Magento Page Builder" },
         {
            value: "hyva-phtml",
            label: "Hyvä PHTML — Chưa hỗ trợ",
            disabled: true,
         },
      ],
      [],
   );

   return (
      <section aria-labelledby="build-launch-heading">
         {/* layout only: neutralize UA heading margins */}
         <h2 id="build-launch-heading" style={{ margin: 0 }}>
            Nguồn và đầu ra
         </h2>
         <form
            onSubmit={(event) => {
               event.preventDefault();
               if (!buildDisabled && parsed.ok) onBuild(sourceInput);
            }}
            noValidate
         >
            <Flex vertical gap="small">
               <Flex vertical gap={4}>
                  <label htmlFor={SOURCE_INPUT_ID}>Nguồn thiết kế Figma</label>
                  <Input
                     id={SOURCE_INPUT_ID}
                     name="buildFigmaSource"
                     type="text"
                     inputMode="url"
                     autoComplete="off"
                     spellCheck={false}
                     placeholder="https://www.figma.com/design/<fileKey>/<fileName>?node-id=245-2 — hoặc 245:2"
                     value={sourceInput}
                     onChange={(event) =>
                        onSourceInputChange(event.target.value)
                     }
                     status={parseFeedback !== null ? "error" : undefined}
                     aria-invalid={parseFeedback !== null ? true : undefined}
                     aria-describedby={
                        parseFeedback !== null
                           ? "build-source-feedback"
                           : undefined
                     }
                  />
                  {parseFeedback !== null ? (
                     <Typography.Text id="build-source-feedback" type="danger">
                        {parseFeedback}
                     </Typography.Text>
                  ) : (
                     <Typography.Text type="secondary">
                        {DEMO_SOURCE_HINT}
                     </Typography.Text>
                  )}
               </Flex>

               <Flex vertical gap={4}>
                  <label htmlFor="build-output-target">Đầu ra</label>
                  <Select
                     id="build-output-target"
                     style={{ maxWidth: 360 }}
                     value="magento-page-builder"
                     options={options}
                     disabled={busy}
                  />
               </Flex>

               <Flex wrap="wrap" align="center" gap="small">
                  <Tooltip title={buildTooltip}>
                     {/* Tooltip needs a non-disabled wrapper element to receive hover */}
                     <span>
                        <Button
                           type="primary"
                           htmlType="submit"
                           disabled={buildDisabled}
                           loading={starting}
                           icon={<CheckCircleOutlined aria-hidden="true" />}
                        >
                           Build
                        </Button>
                     </span>
                  </Tooltip>
                  {gate.blocked ? (
                     <>
                        <Typography.Text type="secondary">
                           {gate.label}
                        </Typography.Text>
                        <Button
                           size="small"
                           onClick={readiness.recheck}
                           loading={readiness.checking}
                        >
                           Kiểm tra lại
                        </Button>
                     </>
                  ) : null}
                  {!gate.blocked && !busy ? (
                     <Typography.Text type="secondary">
                        Build chạy trọn quy trình; server ràng buộc nguồn với
                        bản ghi source-identity đã commit — không khớp thì dừng.
                     </Typography.Text>
                  ) : null}
               </Flex>
            </Flex>
         </form>
      </section>
   );
}
