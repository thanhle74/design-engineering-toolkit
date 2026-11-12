"use client";

import { App as AntdApp } from "antd";

/**
 * [61] DET Studio root providers — stock Ant Design light, no theme.
 *
 * There is intentionally NO ConfigProvider and NO ThemeConfig: Ant Design's
 * out-of-the-box default theme IS the light theme, so light-only costs no
 * configuration (no algorithm choice, no token overrides, no dark mode
 * anywhere). The only wrapper kept is antd's `App`, so `App.useApp()`
 * message/notification context resolves to the real API without per-call
 * contextHolder (the build launcher's feedback path may use it).
 */
export function StudioProviders({ children }: { children: React.ReactNode }) {
   return <AntdApp>{children}</AntdApp>;
}
