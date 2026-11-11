import { Suspense } from "react";
import "./globals.css";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { StudioProviders } from "@/components/layout/studio-providers";
import { studioMetadata } from "@/components/layout/studio-metadata";
import { StudioShell } from "@/components/layout/studio-shell";

export const metadata = studioMetadata;

/**
 * [61] Stock Ant Design light: there is NO custom theme anywhere in the
 * Studio — antd's out-of-the-box default IS the light theme, so the client
 * `StudioProviders` keeps only antd's `App` wrapper and no web fonts are
 * loaded (antd ships its own system font stack). `AntdRegistry` injects the
 * server-rendered first-screen antd styles so the first paint is already
 * styled (no FOUC, no client swap). `globals.css` carries only the light
 * color-scheme and one documented layout exception — no colors, no dark
 * tokens, no `dark` class anywhere.
 */

/**
 * Explicit props — do NOT use Next's generated ambient `LayoutProps` here:
 * it only exists after `next typegen`/build artifacts (`.next/types`), so a
 * fresh checkout running `tsc --noEmit` before any build fails with TS2304
 * (exactly what broke the first `studio` CI run).
 */

/**
 * [61] `AntdRegistry` (and the cssinjs cache it creates) seed an unstable
 * `Math.random()` value, so Next 16's static prerender refuses to bake the antd
 * subtree into the only statically prerendered route (`/_not-found`) without a
 * Suspense boundary. The boundary is the official remedy: the build stores the
 * fallback, every request streams the real styled UI. All Studio routes are
 * dynamic (`connection()`), so the fallback never shows in practice.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Suspense fallback={null}>
          <AntdRegistry>
            <StudioProviders>
              <StudioShell>{children}</StudioShell>
            </StudioProviders>
          </AntdRegistry>
        </Suspense>
      </body>
    </html>
  );
}
