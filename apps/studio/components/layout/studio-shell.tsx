import type { Metadata } from "next";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Integrator-owned studio shell: one calm operator header, no dashboard chrome.
 * Pages compose feature modules beneath it; this component owns navigation only.
 */

export const studioNavItems = [
  { href: "/", label: "Overview" },
] as const;

export const studioMetadata: Metadata = {
  title: {
    default: "DET Studio",
    template: "%s · DET Studio",
  },
  description:
    "Thin review/preview/export UI over the deterministic det CLI. Local trusted operator tool — not a conversion engine.",
};

export function StudioShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <Boxes className="size-4 text-muted-foreground" aria-hidden="true" />
            DET Studio
          </Link>
          <nav aria-label="Studio" className="flex items-center gap-1">
            {studioNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto text-xs text-muted-foreground">
            local trusted operator UI · demo-capable
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-3 text-xs text-muted-foreground">
          DET Studio is a presentation layer over the det CLI — the engine owns all
          conversion logic ([28]). No Figma, Magento or CMS writes from this UI.
        </div>
      </footer>
    </div>
  );
}
