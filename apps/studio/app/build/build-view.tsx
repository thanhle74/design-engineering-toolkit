"use client";

import { ApiOutlined, ToolOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Flex, Typography } from "antd";

import { BuildLauncher, type BuildJobView, type BuildLauncherEntry } from "./build-launcher";

/**
 * [61] Client view child for the Build Control server page: stock antd light
 * heading, catalog/runner alerts and the launcher. All copy — including the
 * STUDIO_BUILD_PROJECTS_DIR / STUDIO_DET_RUNS_DIR / examples / README hint —
 * is carried over verbatim from the previous markup. No custom CSS or utility
 * classes: raw h1 keeps its aria-labelledby target, mono tokens use the stock
 * `Typography.Text code` look.
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
    <Flex vertical gap={32}>
      <section aria-labelledby="build-control-heading">
        <Flex align="center" gap={8}>
          <ToolOutlined aria-hidden="true" />
          {/* layout only: neutralize UA heading margins so the Flex gap owns rhythm */}
          <h1 id="build-control-heading" style={{ margin: 0 }}>
            Build Control
          </h1>
        </Flex>
        <Typography.Paragraph type="secondary">
          Trigger a real offline <Typography.Text code>det build --config</Typography.Text> run
          through the thin local runner and follow it to a verified bundle. Builds run from{" "}
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
              <Typography.Paragraph type="secondary">
                Run Studio from the repository root with{" "}
                <Typography.Text code>npm run dev</Typography.Text> (the committed repository
                examples in <Typography.Text code>examples/build</Typography.Text> are then
                cataloged in place), or set STUDIO_BUILD_PROJECTS_DIR to a directory of
                build-config entries (one subdirectory per entry with a{" "}
                <Typography.Text code>build-config.json</Typography.Text>) and
                STUDIO_DET_RUNS_DIR to the DET output root. See the local build-control setup in{" "}
                <Typography.Text code>apps/studio/README.md</Typography.Text>. This page
                intentionally shows no demo data: a build-control UI must never look like it built
                something it did not.
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

      <Typography.Text type="secondary">
        Single local trusted operator UI · one build at a time (a request while busy fails with
        409 and the live job state) · no auth/DB/queue. The bundle lands in the configured DET
        output root and is then listed as a live run — verified against the build manifest before
        any artifact downloads.
      </Typography.Text>
    </Flex>
  );
}
