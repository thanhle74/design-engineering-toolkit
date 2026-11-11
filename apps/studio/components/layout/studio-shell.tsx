"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppstoreOutlined } from "@ant-design/icons";
import { Flex, Grid, Layout, Menu, Space, Typography, type MenuProps } from "antd";

const { Content, Footer } = Layout;

/**
 * [61] Stock Ant Design light shell — every component renders with its
 * out-of-the-box light defaults. There are NO style props on any antd
 * component: no custom colors, no pinned heights, no Menu background or
 * border overrides, no font-size/weight/letter-spacing tuning, and no
 * Tailwind utility classes. antd is the single source of appearance.
 *
 * Why there is no `Layout.Header`: antd's stock `Header` background token is
 * `headerBg: '#001529'` (verified in antd 6.7.0 `layout/style` component
 * defaults) — the classic dark-navy band, which does not belong in a light
 * UI. The stock light alternative composed here (all default light
 * backgrounds: Menu `itemBg` = white container, Footer `footerBg` =
 * `colorBgLayout` light gray) is a top horizontal `Menu` plus default
 * `Content` and `Footer` directly under the `Layout`.
 *
 * Documented layout exceptions (the correction contract allows a minimal
 * number, each commented):
 * 1. `.studio-content` (globals.css) — antd has no primitive for a centered
 *    max-width content column, so this single geometry-only class centers the
 *    header band and the page content region (margin auto + max-width + padding).
 * 2. `minHeight: "100dvh"` on the `Layout` root — keeps the Footer at the
 *    viewport bottom on short pages; this is antd's own documented Layout
 *    demo pattern, a viewport constraint, not a theme token override.
 *
 * Menu uses the `items` prop (antd 6: no dot-notation children) with real
 * Next `<Link>` labels so client-side routing is preserved; `selectedKeys`
 * matches the pathname exactly (nested routes like /runs/[runId] highlight
 * nothing). antd's overflow collapse into an ellipsis item is the
 * narrow-width/mobile strategy for the Menu itself — keep `disabledOverflow`
 * at its default. Responsive tagline visibility uses antd's `Grid
 * .useBreakpoint()` (no CSS media classes). Metadata lives in the
 * server-safe `./studio-metadata`; a server layout must not import
 * non-component exports from this `'use client'` module.
 */

export const studioNavItems = [
  { href: "/", label: "Overview" },
  { href: "/build", label: "Build" },
  { href: "/catalog", label: "Catalog" },
] as const;

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const screens = Grid.useBreakpoint();

  const navMenuItems: MenuProps["items"] = studioNavItems.map((item) => ({
    key: item.href,
    label: <Link href={item.href}>{item.label}</Link>,
  }));

  const selectedKeys = studioNavItems
    .filter((item) => item.href === pathname)
    .map((item) => item.href);

  return (
    <Layout style={{ minHeight: "100dvh" }}>
      <header className="studio-content">
        <Flex align="center" justify="space-between" gap="middle" wrap="wrap">
          <Link href="/" aria-label="DET Studio home">
            <Space align="center" size="small">
              <AppstoreOutlined aria-hidden="true" />
              <Typography.Text strong>DET Studio</Typography.Text>
            </Space>
          </Link>
          <Menu
            aria-label="Studio"
            mode="horizontal"
            items={navMenuItems}
            selectedKeys={selectedKeys}
          />
          {screens.md ? (
            <Typography.Text type="secondary">
              local trusted operator UI · demo-capable
            </Typography.Text>
          ) : null}
        </Flex>
      </header>
      <Content>
        <div className="studio-content">{children}</div>
      </Content>
      <Footer>
        <Typography.Text type="secondary">
          DET Studio is a presentation layer over the det CLI — the engine owns
          all conversion logic ([28]). No Figma, Magento or CMS writes from
          this UI.
        </Typography.Text>
      </Footer>
    </Layout>
  );
}
