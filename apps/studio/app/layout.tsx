import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
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
 * Explicit props — do NOT use Next's generated ambient `LayoutProps` here:
 * it only exists after `next typegen`/build artifacts (`.next/types`), so a
 * fresh checkout running `tsc --noEmit` before any build fails with TS2304
 * (exactly what broke the first `studio` CI run).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable)}
    >
      <body className="min-h-full flex flex-col">
        <StudioShell>{children}</StudioShell>
      </body>
    </html>
  );
}
