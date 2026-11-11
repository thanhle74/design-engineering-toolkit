"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Typography } from "antd";

import type { StudioRunMode } from "@/src/shared/contracts";
import { RunModeBadge } from "@/src/modules/mapping-review";

/**
 * [61] Client view child for the run page header: the back-to-overview
 * button, the run label heading, the engine-emitted mode badge and the mono
 * run id. Copy and structure carried over verbatim from the shadcn markup.
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
    <div className="flex flex-col gap-3">
      <Button
        type="text"
        href="/"
        icon={<ArrowLeftOutlined aria-hidden="true" />}
        className="w-fit self-start"
      >
        Overview
      </Button>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{label}</h1>
        <RunModeBadge mode={mode} />
      </div>
      <p className="font-mono text-xs">
        <Typography.Text type="secondary">{runId}</Typography.Text>
      </p>
    </div>
  );
}
