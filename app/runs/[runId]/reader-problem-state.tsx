"use client";

import { ApiOutlined, ArrowLeftOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Flex, Typography } from "antd";

/**
 * [61] Client view child for the run page's reader problem states (run not
 * found / reader error). Copy is passed through verbatim from the server
 * page (Vietnamese labels; the reader error code and the raw reader message
 * stay verbatim machine tokens). The icon is driven by the explicit `kind`
 * prop instead of matching on title text (run-not-found → WarningOutlined,
 * reader-error → ApiOutlined). Stock antd light only — no custom CSS.
 */
export function ReaderProblemState({
  kind,
  title,
  message,
  hint,
}: {
  kind: "run-not-found" | "reader-error";
  title: string;
  message: string;
  hint: string;
}) {
  const runNotFound = kind === "run-not-found";
  return (
    <Flex vertical gap={16} align="flex-start">
      <Button
        type="text"
        href="/"
        icon={<ArrowLeftOutlined aria-hidden="true" />}
      >
        Tổng quan
      </Button>
      <Alert
        type="warning"
        showIcon
        icon={
          runNotFound ? (
            <WarningOutlined aria-hidden="true" />
          ) : (
            <ApiOutlined aria-hidden="true" />
          )
        }
        message={title}
        description={
          <>
            <p>{message}</p>
            <Typography.Paragraph type="secondary">{hint}</Typography.Paragraph>
          </>
        }
      />
    </Flex>
  );
}
