"use client";

import { ApiOutlined, ArrowLeftOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Button, Typography } from "antd";

/**
 * [61] Client view child for the run page's reader problem states (run not
 * found / reader error). Copy is passed through verbatim from the server
 * page; the icon follows the same title logic as the previous shadcn markup
 * (CircleAlert for "Run not found", Unplug otherwise → WarningOutlined /
 * ApiOutlined).
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
    <div className="flex flex-col gap-4">
      <Button
        type="text"
        href="/"
        icon={<ArrowLeftOutlined aria-hidden="true" />}
        className="w-fit"
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
            <Typography.Paragraph type="secondary" className="mt-2 text-sm">
              {hint}
            </Typography.Paragraph>
          </>
        }
      />
    </div>
  );
}
