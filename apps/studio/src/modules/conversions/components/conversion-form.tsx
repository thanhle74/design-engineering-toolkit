"use client";

/**
 * [29] DET Studio — New Conversion form (client component, lane W-A).
 *
 * The studio's entry action: parse/validate a Figma design source, pick an
 * output target and (when configured) a project profile. On a valid submit it
 * renders the honest NOT CONNECTED result state — the form never claims a
 * conversion ran, never shows progress, and stores nothing anywhere.
 *
 * There is deliberately NO Figma token field: [28]'s engine owns Figma access.
 *
 * [61] Ant Design light-only, deliberately WITHOUT antd Form: the plain
 * <form onSubmit> + requestSubmit flow and the plain <p role="alert">
 * validation error are kept (no antd Form validation machinery, no progress
 * states). antd Selects use the `options` prop and carry the same ids the
 * labels point at, so label association keeps working through antd's inner
 * search input.
 */
import * as React from "react";
import { ApiOutlined } from "@ant-design/icons";
import { Button, Input, Select, Typography } from "antd";

import { DEFAULT_OUTPUT_TARGET, OUTPUT_TARGET_OPTIONS } from "../conversion-options";
import { parseFigmaInput, type FigmaInputParseResult } from "../figma-input";
import type {
  ConversionOutputTarget,
  ConversionRequestSummary,
  StudioProfileOption,
} from "../types";
import { NotConnectedResult } from "./not-connected-result";

interface ConversionFormProps {
  /**
   * Project profiles from local DET profile configuration, supplied by the host
   * page. Absent or empty renders the truthful NOT_CONFIGURED hint; the
   * module-local DEMO_PROFILES constant exists for tests/demo wiring only.
   */
  profiles?: readonly StudioProfileOption[];
  className?: string;
}

const SOURCE_INPUT_ID = "figma-source";
const SOURCE_ERROR_ID = "figma-source-error";
const SOURCE_HELP_ID = "figma-source-help";
const TARGET_SELECT_ID = "output-target";
const PROFILE_SELECT_ID = "project-profile";

export function ConversionForm({ profiles, className }: ConversionFormProps) {
  const availableProfiles = React.useMemo(
    () => (profiles && profiles.length > 0 ? profiles : []),
    [profiles]
  );
  const profilesConfigured = availableProfiles.length > 0;

  const [sourceInput, setSourceInput] = React.useState("");
  const [target, setTarget] = React.useState<ConversionOutputTarget>(DEFAULT_OUTPUT_TARGET);
  const [profileId, setProfileId] = React.useState<string>("");
  const [validation, setValidation] = React.useState<FigmaInputParseResult | null>(null);
  const [summary, setSummary] = React.useState<ConversionRequestSummary | null>(null);

  // Fall back to the first configured profile when no explicit choice was made.
  const selectedProfileId = profileId || availableProfiles[0]?.id || "";
  const selectedProfile = availableProfiles.find((p) => p.id === selectedProfileId) ?? null;

  const validationError = validation && !validation.ok ? validation : null;

  function handleSourceChange(event: React.ChangeEvent<HTMLInputElement>) {
    setSourceInput(event.target.value);
    // Re-validate live once an error is showing so the message can't go stale.
    if (validationError) {
      setValidation(parseFigmaInput(event.target.value));
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = parseFigmaInput(sourceInput);
    if (!parsed.ok) {
      // Invalid input blocks submit with a clear, inline reason.
      setValidation(parsed);
      setSummary(null);
      return;
    }

    setValidation(null);
    setSummary({
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
      inputKind: parsed.inputKind,
      target,
      profileId: selectedProfile?.id ?? null,
      profileName: selectedProfile?.name ?? null,
    });
  }

  return (
    <section aria-labelledby="new-conversion-heading" className={"w-full max-w-2xl " + (className ?? "")}>
      <h2 id="new-conversion-heading" className="text-base font-semibold tracking-tight">
        New conversion
      </h2>
      <Typography.Paragraph type="secondary" className="mt-1 text-xs">
        Point the studio at one Figma frame to convert. Studio only prepares and reviews the
        request — the det engine performs the conversion.
      </Typography.Paragraph>

      <form className="mt-4 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={SOURCE_INPUT_ID}
            className="text-sm font-medium"
          >
            Figma design source
          </label>
          <Input
            id={SOURCE_INPUT_ID}
            name="figmaSource"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://www.figma.com/design/<fileKey>/<fileName>?node-id=245-2 — or 245:2"
            value={sourceInput}
            onChange={handleSourceChange}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                // Uniform keyboard submit: implicit form submission for Enter in
                // text inputs varies by engine, so request it exactly once here.
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            status={validationError ? "error" : undefined}
            aria-invalid={validationError ? true : undefined}
            aria-describedby={validationError ? `${SOURCE_ERROR_ID} ${SOURCE_HELP_ID}` : SOURCE_HELP_ID}
            className="font-mono"
          />
          {validationError ? (
            <p
              id={SOURCE_ERROR_ID}
              role="alert"
              className="text-xs"
              style={{ color: "var(--ant-color-error, #ff4d4f)" }}
            >
              {validationError.message}
            </p>
          ) : null}
          <p id={SOURCE_HELP_ID} className="text-xs">
            <Typography.Text type="secondary">
              Accepted: a Figma design-file URL including node-id (…?node-id=1-2), or a bare node
              id like 245:2. A URL without node-id is rejected — the engine needs a node to extract.
            </Typography.Text>
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={TARGET_SELECT_ID} className="text-sm font-medium">
              Output target
            </label>
            {/* antd Select keeps the id on its inner search input, so the
                label association above still names the combobox. */}
            <Select
              id={TARGET_SELECT_ID}
              className="w-full"
              value={target}
              onChange={(value) => setTarget(value as ConversionOutputTarget)}
              options={OUTPUT_TARGET_OPTIONS.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            {profilesConfigured ? (
              <>
                <label htmlFor={PROFILE_SELECT_ID} className="text-sm font-medium">
                  Project profile
                </label>
                <Select
                  id={PROFILE_SELECT_ID}
                  className="w-full"
                  value={selectedProfileId || undefined}
                  onChange={(value) => setProfileId(value)}
                  options={availableProfiles.map((profile) => ({
                    value: profile.id,
                    label: profile.name,
                  }))}
                />
              </>
            ) : (
              <div
                data-testid="profiles-not-configured"
                className="px-4 py-3"
                style={{
                  border: "1px dashed var(--ant-color-border, #d9d9d9)",
                  borderRadius: "var(--ant-border-radius, 6px)",
                }}
              >
                <p className="text-xs font-medium">Profile: NOT CONFIGURED</p>
                <Typography.Paragraph type="secondary" className="mt-0.5 text-xs">
                  No project profiles configured — profiles come from local DET profile
                  configuration.
                </Typography.Paragraph>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="primary" htmlType="submit">
              Review conversion request
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs">
              <ApiOutlined aria-hidden="true" />
              <Typography.Text type="secondary">
                Execution not connected — issue [28] owns the engine bridge.
              </Typography.Text>
            </span>
          </div>
          <p className="text-xs">
            <Typography.Text type="secondary">
              Submitting only validates this input and shows a request summary. No conversion runs
              and nothing is stored.
            </Typography.Text>
          </p>
        </div>
      </form>

      {summary ? <NotConnectedResult summary={summary} className="mt-5" /> : null}
    </section>
  );
}
