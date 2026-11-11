"use client";

import { ApiOutlined, ToolOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Typography } from "antd";

import { BuildLauncher, type BuildJobView, type BuildLauncherEntry } from "./build-launcher";

/**
 * [61] Client view child for the Build Control server page: antd light-only
 * heading, catalog/runner alerts and the launcher. All copy — including the
 * STUDIO_BUILD_PROJECTS_DIR / STUDIO_DET_RUNS_DIR / examples / README hint —
 * is carried over verbatim from the previous shadcn markup.
 */

interface BuildViewProps {
  catalogErrorCode: string | null;
  catalogErrorMessage: string | null;
  catalogEntries: BuildLauncherEntry[] | null;
  catalogInvalid: Array<{ configId: string; reason: string }>;
  runnerReady: boolean;
  runnerReason?: string;
  initialActive: BuildJobView | null;
}

export function BuildView({
  catalogErrorCode,
  catalogErrorMessage,
  catalogEntries,
  catalogInvalid,
  runnerReady,
  runnerReason,
  initialActive,
}: BuildViewProps) {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="build-control-heading">
        <h1
          id="build-control-heading"
          className="flex items-center gap-2.5 text-xl font-semibold tracking-tight md:text-2xl"
        >
          <ToolOutlined aria-hidden="true" />
          Build Control
        </h1>
        <Typography.Paragraph type="secondary" className="mt-2 max-w-3xl text-sm">
          Trigger a real offline <span className="font-mono">det build --config</span> run through
          the thin local runner and follow it to a verified bundle. Builds run from{" "}
          <strong>offline snapshot sources only</strong> (the build config pins the design source);
          one build at a time; the engine owns every conversion decision — this page only starts it
          and reports what actually happened.
        </Typography.Paragraph>
      </section>

      {catalogErrorCode !== null ? (
        <Alert
          type="warning"
          showIcon
          icon={<ApiOutlined aria-hidden="true" />}
          message={`Build catalog not configured (${catalogErrorCode})`}
          description={
            <>
              <p>{catalogErrorMessage}</p>
              <Typography.Paragraph type="secondary" className="mt-2 text-sm">
                Run Studio from the repository root with{" "}
                <span className="font-mono">npm run dev</span> (the committed repository examples in{" "}
                <span className="font-mono">examples/build</span> are then cataloged in place), or
                set STUDIO_BUILD_PROJECTS_DIR to a directory of build-config entries (one
                subdirectory per entry with a <span className="font-mono">build-config.json</span>)
                and STUDIO_DET_RUNS_DIR to the DET output root. See the local build-control setup in{" "}
                <span className="font-mono">apps/studio/README.md</span>. This page intentionally
                shows no demo data: a build-control UI must never look like it built something it
                did not.
              </Typography.Paragraph>
            </>
          }
        />
      ) : catalogEntries !== null ? (
        <BuildLauncher
          entries={catalogEntries}
          invalid={catalogInvalid}
          runnerReady={runnerReady}
          runnerReason={runnerReason}
          initialActive={initialActive}
        />
      ) : (
        <Alert
          type="error"
          showIcon
          icon={<WarningOutlined aria-hidden="true" />}
          message="Build catalog unavailable"
          description="The catalog could not be read on this server."
        />
      )}

      <p className="text-xs">
        <Typography.Text type="secondary">
          Single local trusted operator UI · one build at a time (a request while busy fails with
          409 and the live job state) · no auth/DB/queue. The bundle lands in the configured DET
          output root and is then listed as a live run — verified against the build manifest before
          any artifact downloads.
        </Typography.Text>
      </p>
    </div>
  );
}
