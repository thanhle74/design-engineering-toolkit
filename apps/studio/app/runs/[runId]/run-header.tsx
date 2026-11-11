"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Flex, Typography } from "antd";

import type { StudioRunMode } from "@/src/shared/contracts";
import { RunModeBadge } from "@/src/modules/mapping-review";

/**
 * [61] Client view child for the run page header: the back-to-overview
 * button, the run label heading, the engine-emitted mode badge and the mono
 * run id. Copy and structure carried over verbatim; stock antd only — the raw
 * h1 keeps its heading semantics, the run id uses the stock `Text code` look.
 */
export function RunHeader({
  label,
  mode,
  runId,
}: {
  label: string;
  mode: StudioRunMode;
  runId: string;
}) {
  return (
    <Flex vertical gap={8} align="flex-start">
      <Button
        type="text"
        href="/"
        icon={<ArrowLeftOutlined aria-hidden="true" />}
      >
        Overview
      </Button>
      <Flex wrap="wrap" align="center" gap={8}>
        {/* layout only: neutralize UA heading margins so the Flex gap owns rhythm */}
        <h1 style={{ margin: 0 }}>{label}</h1>
        <RunModeBadge mode={mode} />
      </Flex>
      <Typography.Text type="secondary" code>
        {runId}
      </Typography.Text>
    </Flex>
  );
}
