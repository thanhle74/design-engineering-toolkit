"use client";

import { SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Card, Collapse, Flex, List, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";

import type { StudioBuildStageView, StudioRunView } from "@/src/studio/shared/contracts";

/**
 * [40] Build-bundle section — rendered ONLY when the run view carries the
 * additive `build` block (i.e. the run is a `det build` bundle). Shows the
 * persisted stage table, the honest gap list, and Studio-side manifest
 * verification truth. Native Page Builder HTML stays source/download only:
 * no Magento storefront or Admin preview is claimed anywhere here.
 *
 * [61] Stock antd light presentation only: Card/Alert/Table/List/Collapse/Flex
 * and the stock `Text code` inline-code look for mono tokens; no custom CSS or
 * utility classes. The two inline styles are pure layout (documented inline).
 * Copy is natural Vietnamese; every machine token (stage names, status enums,
 * build-manifest.json, det build, profile/platform ids, config hash, gap
 * codes) stays verbatim. Each gap shows a short Vietnamese lead-in plus the
 * raw code chip, and the original English machine messages stay reachable —
 * collected in a single default-collapsed Collapse item "Chi tiết kỹ thuật".
 */

type StageRow = Pick<StudioBuildStageView, "stage" | "status" | "exitCode" | "outDir">;

const stageColumns: TableColumnsType<StageRow> = [
  {
    title: "Giai đoạn",
    dataIndex: "stage",
    render: (_, record: StageRow) => <Typography.Text code>{record.stage}</Typography.Text>,
  },
  {
    title: "Trạng thái",
    dataIndex: "status",
    render: (_, record: StageRow) =>
      record.status === "failed" ? (
        <Tag color="error">{record.status}</Tag>
      ) : (
        <Tag>{record.status}</Tag>
      ),
  },
  {
    title: "Mã thoát",
    dataIndex: "exitCode",
    render: (_, record: StageRow) => <Typography.Text code>{record.exitCode}</Typography.Text>,
  },
  {
    title: "Thư mục output",
    dataIndex: "outDir",
    render: (_, record: StageRow) => (
      <Typography.Text code>{record.outDir ?? "—"}</Typography.Text>
    ),
  },
];

/**
 * Short Vietnamese lead-in per known gap code ([61]). Unknown codes fall back
 * to a generic honest line — the raw code chip and the original machine
 * message are always rendered, so nothing is paraphrased away.
 */
const GAP_LEADS: Record<string, string> = {
  COMPOSITION_SKIPS_PRESENT: "Một số node đã bị bỏ qua trong quá trình ghép.",
  COMPOSITION_GAPS_PRESENT: "Có nội dung chưa ghép được vào cấu trúc Page Builder.",
  PREVIEW_INSTALL_OPERATOR_GATED: "Bản xem trước cần vận hành viên tự cài đặt.",
  PREVIEW_ASSETS_NOT_GENERATED: "Chưa tạo tài nguyên cho bản xem trước.",
  PREVIEW_UNAVAILABLE: "Hiện chưa có bản xem trước.",
};

function gapLead(code: string): string {
  return GAP_LEADS[code] ?? "Engine ghi nhận một khoảng trống ở lần chạy này.";
}

export function BuildBundleSection({ run }: { run: StudioRunView }) {
  const build = run.build;
  if (build === undefined) return null;

  const failedStages = build.stages.filter((stage) => stage.status === "failed");

  return (
    <Card
      size="small"
      title={
        <Flex align="center" gap={8}>
          <SafetyCertificateOutlined aria-hidden="true" />
          {/* layout only: neutralize UA heading margins so the Flex gap owns rhythm */}
          <h2 style={{ margin: 0 }}>Gói build</h2>
        </Flex>
      }
    >
      <Flex vertical gap={16}>
        <Typography.Paragraph type="secondary">
          Lắp ráp từ gói <Typography.Text code>build-manifest.json</Typography.Text> do{" "}
          <Typography.Text code>det build</Typography.Text> ghi ra (hồ sơ{" "}
          <Typography.Text code>{run.profileId ?? "không rõ"}</Typography.Text>, nền tảng{" "}
          <Typography.Text code>{run.platformId ?? "không rõ"}</Typography.Text>). Manifest gốc là
          mốc tin cậy; mọi output khai báo đều được kiểm tra lại với SHA-256 và dung lượng
          byte đã ghi trước khi cho tải xuống.
        </Typography.Paragraph>

        {build.manifestVerified ? (
          <Typography.Text type="secondary">
            <SafetyCertificateOutlined aria-hidden="true" /> Đã xác minh: mọi output khớp SHA-256 và
            kích thước đã ghi.
          </Typography.Text>
        ) : (
          <Alert
            type="error"
            showIcon
            icon={<WarningOutlined aria-hidden="true" />}
            message="Xác minh manifest thất bại"
            description="Ít nhất một output khai báo không khớp SHA-256/dung lượng đã ghi — gói có thể bị sửa hoặc đã cũ. Lượt tải các output trong manifest bị từ chối cho tới khi gói được build lại."
          />
        )}

        <Table<StageRow>
          rowKey="stage"
          columns={stageColumns}
          dataSource={build.stages}
          pagination={false}
          size="small"
        />

        <Flex vertical gap={8}>
          {/* layout only: neutralize UA heading margins */}
          <h3 style={{ margin: 0 }}>
            Khoảng trống {failedStages.length > 0 ? "" : "và ranh giới"}
          </h3>
          <List
            size="small"
            dataSource={build.gaps}
            renderItem={(gap) => (
              <List.Item>
                <Flex vertical gap={4}>
                  <Typography.Text code>
                    {gap.code}
                    {gap.count !== undefined ? ` · số lượng ${gap.count}` : ""}
                  </Typography.Text>
                  <Typography.Text>{gapLead(gap.code)}</Typography.Text>
                </Flex>
              </List.Item>
            )}
          />
          {build.gaps.length > 0 ? (
            <Collapse
              items={[
                {
                  key: "chi-tiet-ky-thuat",
                  label: "Chi tiết kỹ thuật",
                  children: (
                    <List
                      size="small"
                      dataSource={build.gaps}
                      renderItem={(gap) => (
                        <List.Item>
                          <Flex vertical gap={4}>
                            <Typography.Text code>{gap.code}</Typography.Text>
                            <Typography.Text type="secondary">
                              {gap.message}
                            </Typography.Text>
                          </Flex>
                        </List.Item>
                      )}
                    />
                  ),
                },
              ]}
            />
          ) : null}
        </Flex>

        <Typography.Text type="secondary">
          Định danh cấu hình <Typography.Text code>{build.configContentHash}</Typography.Text>{" "}
          · Gói này là bản build ngoại tuyến. HTML Native Page Builder chỉ được cung cấp dưới
          dạng <strong>nguồn/tải xuống</strong> — việc cài vào một bản Magento và mọi bản xem
          trước storefront/Admin vẫn là bước của vận hành viên (xem các khoảng trống trong
          manifest), không bao giờ là tuyên bố của UI này.
        </Typography.Text>
      </Flex>
    </Card>
  );
}
