"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppstoreOutlined } from "@ant-design/icons";
import { Flex, Layout, Menu, Space, Typography, type MenuProps } from "antd";

import { ReadinessIndicator } from "./readiness-indicator";

const { Content } = Layout;

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
 * UI. The stock light composition here (default light backgrounds only:
 * Menu `itemBg` = white container) is a top horizontal `Menu` plus a default
 * `Content` directly under the `Layout`. The shell stays compact — brand
 * plus nav only: no tagline and no `Layout.Footer`.
 *
 * Documented layout exceptions (the correction contract allows a minimal
 * number, each commented):
 * 1. `.studio-content` (globals.css) — antd has no primitive for a centered
 *    max-width content column, so this single geometry-only class centers the
 *    header band and the page content region (margin auto + max-width + padding).
 * 2. `minHeight: "100dvh"` on the `Layout` root — keeps the layout filling
 *    the viewport on short pages; this is antd's own documented Layout demo
 *    pattern, a viewport constraint, not a theme token override.
 * 3. `style={{ flex: "auto", minWidth: 0 }}` on the horizontal `Menu` — pure
 *    flex sizing so the brand and the nav share the header row; without it
 *    the Menu measures a min-content width and antd collapses the items into
 *    the ellipsis overflow indicator even on desktop. Same pattern as antd's
 *    own top-navigation header demo; geometry only, no theme values.
 * 4. `.ant-layout` (globals.css) — Owner request (C61-2): the whole-site main
 *    background is white; the rule uses antd's own container token variable.
 *
 * Menu uses the `items` prop (antd 6: no dot-notation children) with real
 * Next `<Link>` labels so client-side routing is preserved; `selectedKeys`
 * matches the pathname exactly (nested routes like /runs/[runId] highlight
 * nothing). Human-readable copy is natural Vietnamese; "DET Studio"
 * and "Build" stay Latin/English on purpose (brand and machine-term naming).
 * Metadata lives in the server-safe `./studio-metadata`; a server layout must
 * not import non-component exports from this `'use client'` module.
 *
 * [70] Header readiness cluster: the nav drops `/agent` (the one-click Build
 * flow replaces the standalone AI-analysis page; /agent now redirects to
 * /build), leaving exactly three nav items, and the header row gains the
 * compact `ReadinessIndicator` (state chip + "Kiểm tra" button, stock antd
 * APIs only — see that file's header comment for the preset-color/loading
 * notes). No new style props are introduced on any antd component.
 */

export const studioNavItems = [
   { href: "/", label: "Tổng quan" },
   { href: "/build", label: "Build" },
   { href: "/catalog", label: "Dự án" },
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
      <Layout style={{ minHeight: "100dvh" }}>
         <header className="studio-content">
            <Flex
               align="center"
               justify="space-between"
               gap="middle"
               wrap="wrap"
            >
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
                  style={{ flex: "auto", minWidth: 0 }}
               />
               <ReadinessIndicator />
            </Flex>
         </header>
         <Content>
            <div className="studio-content">{children}</div>
         </Content>
      </Layout>
   );
}
