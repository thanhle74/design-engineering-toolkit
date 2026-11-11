import { Suspense } from "react";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { StudioProviders } from "@/components/layout/studio-providers";
import { StudioShell, studioMetadata } from "@/components/layout/studio-shell";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = studioMetadata;

/**
 * [61] Light-only theme: Ant Design owns component theming through the client
 * `StudioProviders` (ConfigProvider `defaultAlgorithm` — no dark algorithm, no
 * toggle, no OS switch). `AntdRegistry` injects the server-rendered first-screen
 * antd styles so the first paint is already styled (no FOUC, no client swap).
 * Tailwind remains only for layout utilities; globals.css carries a neutral
 * light palette with no dark tokens and no `dark` class.
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} font-sans antialiased`}
    >
      <body className="min-h-full flex flex-col">
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
