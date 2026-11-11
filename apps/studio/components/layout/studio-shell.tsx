"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppstoreOutlined } from "@ant-design/icons";
import { Layout, Menu, Typography, type MenuProps } from "antd";

const { Content, Footer, Header } = Layout;

/**
 * Integrator-owned studio shell: one calm operator header, no dashboard chrome.
 * Pages compose feature modules beneath it; this component owns navigation only.
 *
 * [61] Ant Design light shell (replaces the Tailwind/shadcn server shell):
 * - antd owns component color/theme through the light-only `StudioProviders`
 *   ConfigProvider; Tailwind stays only for layout utilities (flex, gap, px,
 *   py, max-w, hidden md:inline) — no shadcn tokens, no `dark:` variants.
 * - Header/Footer are pinned white with a single `#e3e7ec` rule each; the
 *   horizontal Menu's own faint `borderBottom` is cleared so the header edge
 *   carries exactly one rule.
 * - Header stays 64px (the previous `h-16` shell height). antd derives
 *   `headerHeight` from `controlHeight` (44px token → 88px default), so the
 *   height is pinned here while the 44px Menu items still clear the operator
 *   click-target requirement.
 * - Menu uses the `items` prop (antd 6: no dot-notation children) with real
 *   Next `<Link>` labels, so client-side routing is preserved; `selectedKeys`
 *   matches the pathname exactly (nested routes like /runs/[runId] highlight
 *   nothing). antd's overflow collapse into an ellipsis item is the
 *   narrow-width/mobile strategy — keep `disabledOverflow` at its default.
 * - Metadata lives in the server-safe `./studio-metadata`; a server layout must
 *   not import non-component exports from this `'use client'` module.
 */

export const studioNavItems = [
  { href: "/", label: "Overview" },
  { href: "/build", label: "Build" },
  { href: "/catalog", label: "Catalog" },
] as const;

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navMenuItems: MenuProps["items"] = studioNavItems.map((item) => ({
    key: item.href,
    label: <Link href={item.href}>{item.label}</Link>,
  }));

  const selectedKeys = studioNavItems
    .filter((item) => item.href === pathname)
    .map((item) => item.href);

  return (
    <Layout style={{ minHeight: "100dvh", background: "transparent" }}>
      <Header
        style={{
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e3e7ec",
          display: "flex",
          alignItems: "center",
          height: 64,
          lineHeight: 1,
          padding: 0,
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 whitespace-nowrap text-base font-semibold tracking-tight"
          >
            <AppstoreOutlined aria-hidden="true" style={{ fontSize: 20 }} />
            DET Studio
          </Link>
          <Menu
            aria-label="Studio"
            mode="horizontal"
            items={navMenuItems}
            selectedKeys={selectedKeys}
            style={{
              flex: 1,
              minWidth: 0,
              justifyContent: "flex-end",
              background: "transparent",
              borderBottom: "none",
            }}
          />
          <Typography.Text
            type="secondary"
            className="hidden whitespace-nowrap md:inline"
          >
            local trusted operator UI · demo-capable
          </Typography.Text>
        </div>
      </Header>
      <Content className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-10 lg:px-8">
        {children}
      </Content>
      <Footer
        style={{
          backgroundColor: "#ffffff",
          borderTop: "1px solid #e3e7ec",
          padding: 0,
        }}
      >
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Typography.Text type="secondary">
            DET Studio is a presentation layer over the det CLI — the engine owns
            all conversion logic ([28]). No Figma, Magento or CMS writes from
            this UI.
          </Typography.Text>
        </div>
      </Footer>
    </Layout>
  );
}
