"use client";

import { App as AntdApp, ConfigProvider, theme, type ThemeConfig } from "antd";

/**
 * [61] Light-only Ant Design root providers.
 *
 * `defaultAlgorithm` is set explicitly: Studio is light-only — no dark
 * algorithm, no theme toggle, no OS-following. Ant Design is the single source
 * of component theming; Tailwind stays only for layout utilities. The App
 * wrapper pairs with ConfigProvider so antd message/notification context works
 * without per-call contextHolder (used by the build launcher's 409 feedback).
 *
 * Tokens: 44px default control height carries the "generous 44px+ click
 * targets" operator requirement into every Button/Input/Select; everything
 * else stays on antd's calm neutral light defaults.
 */
export const STUDIO_ANTD_THEME: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    controlHeight: 44,
    borderRadius: 6,
    fontFamily:
      "var(--font-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Menu: { itemHeight: 44 },
  },
};

export function StudioProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={STUDIO_ANTD_THEME}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}
