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
  { href: "/build", label: "Build" },
  { href: "/catalog", label: "Catalog" },
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
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 whitespace-nowrap text-base font-semibold tracking-tight"
          >
            <Boxes className="size-5 text-muted-foreground" aria-hidden="true" />
            DET Studio
          </Link>
          <nav aria-label="Studio" className="flex items-center gap-1.5">
            {studioNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring/60 sm:px-3.5"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto hidden text-xs text-muted-foreground md:inline">
            local trusted operator UI · demo-capable
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:py-10 lg:px-8">
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6 lg:px-8">
          DET Studio is a presentation layer over the det CLI — the engine owns all
          conversion logic ([28]). No Figma, Magento or CMS writes from this UI.
        </div>
      </footer>
    </div>
  );
}
