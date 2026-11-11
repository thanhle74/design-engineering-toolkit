"use client";

import { ApiOutlined, ArrowLeftOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Flex, Typography } from "antd";

/**
 * [61] Client view child for the run page's reader problem states (run not
 * found / reader error). Copy is passed through verbatim from the server
 * page; the icon follows the same title logic as the previous markup
 * (CircleAlert for "Run not found", Unplug otherwise → WarningOutlined /
 * ApiOutlined). Stock antd light only — no custom CSS or utility classes.
 */
export function ReaderProblemState({
  title,
  message,
  hint,
}: {
  title: string;
  message: string;
  hint: string;
}) {
  const runNotFound = title === "Run not found";
  return (
    <Flex vertical gap={16} align="flex-start">
      <Button
        type="text"
        href="/"
        icon={<ArrowLeftOutlined aria-hidden="true" />}
      >
        Overview
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
