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
 * [61] Ant Design stock light appearance, deliberately WITHOUT antd Form: the
 * plain <form onSubmit> + requestSubmit flow and the plain <p role="alert">
 * validation error are kept (no antd Form validation machinery, no progress
 * states). antd Selects use the `options` prop and carry the same ids the
 * labels point at, so label association keeps working through antd's inner
 * search input. Layout uses stock antd Flex/Grid primitives only.
 */
import * as React from "react";
import { ApiOutlined } from "@ant-design/icons";
import { Button, Col, Flex, Input, Row, Select, Typography } from "antd";

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
    <section aria-labelledby="new-conversion-heading" className={className}>
      <h2 id="new-conversion-heading">Chuyển đổi mới</h2>
      <Typography.Paragraph type="secondary">
        Trỏ Studio vào một frame Figma để chuyển đổi. Studio chỉ chuẩn bị và soát lại yêu cầu —
        engine det mới thực hiện chuyển đổi.
      </Typography.Paragraph>

      <form onSubmit={handleSubmit} noValidate>
        <Flex vertical gap="middle">
          <Flex vertical gap="small">
            <label htmlFor={SOURCE_INPUT_ID}>Nguồn thiết kế Figma</label>
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
            />
            {validationError ? (
              <p id={SOURCE_ERROR_ID} role="alert">
                <Typography.Text type="danger">
                  {validationError.message}
                </Typography.Text>
              </p>
            ) : null}
            <p id={SOURCE_HELP_ID}>
              <Typography.Text type="secondary">
                Chấp nhận: URL file thiết kế Figma kèm node-id (…?node-id=1-2), hoặc node id trần
                dạng 245:2. URL thiếu node-id sẽ bị từ chối — engine cần một node để trích xuất.
              </Typography.Text>
            </p>
          </Flex>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Flex vertical gap="small">
                <label htmlFor={TARGET_SELECT_ID}>Đích xuất</label>
                {/* antd Select keeps the id on its inner search input, so the
                    label association above still names the combobox. */}
                <Select
                  id={TARGET_SELECT_ID}
                  // layout only
                  style={{ width: "100%" }}
                  value={target}
                  onChange={(value) => setTarget(value as ConversionOutputTarget)}
                  options={OUTPUT_TARGET_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
              </Flex>
            </Col>
            <Col xs={24} md={12}>
              <Flex vertical gap="small">
                {profilesConfigured ? (
                  <>
                    <label htmlFor={PROFILE_SELECT_ID}>Hồ sơ dự án</label>
                    <Select
                      id={PROFILE_SELECT_ID}
                      // layout only
                      style={{ width: "100%" }}
                      value={selectedProfileId || undefined}
                      onChange={(value) => setProfileId(value)}
                      options={availableProfiles.map((profile) => ({
                        value: profile.id,
                        label: profile.name,
                      }))}
                    />
                  </>
                ) : (
                  // Plain div on purpose: the form's single <p role="alert">
                  // validation error must stay the only alert role here.
                  <div data-testid="profiles-not-configured">
                    <Typography.Text strong>
                      Hồ sơ: Chưa cấu hình{" "}
                      <Typography.Text code>NOT_CONFIGURED</Typography.Text>
                    </Typography.Text>
                    <Typography.Paragraph type="secondary">
                      Chưa có hồ sơ dự án nào được cấu hình — hồ sơ lấy từ cấu hình
                      profile DET cục bộ.
                    </Typography.Paragraph>
                  </div>
                )}
              </Flex>
            </Col>
          </Row>

          <Flex vertical gap="small">
            <Flex wrap="wrap" align="center" gap="small">
              <Button type="primary" htmlType="submit">
                Xem lại yêu cầu
              </Button>
              <Flex align="center" gap="small">
                <ApiOutlined aria-hidden="true" />
                <Typography.Text type="secondary">
                  Chưa kết nối phần thực thi — cầu nối engine thuộc [28].
                </Typography.Text>
              </Flex>
            </Flex>
            <p>
              <Typography.Text type="secondary">
                Việc gửi chỉ kiểm tra dữ liệu vừa nhập và hiển thị tóm tắt yêu cầu. Không có
                chuyển đổi nào chạy và không lưu gì cả.
              </Typography.Text>
            </p>
          </Flex>
        </Flex>
      </form>

      {summary ? <NotConnectedResult summary={summary} /> : null}
    </section>
  );
}
