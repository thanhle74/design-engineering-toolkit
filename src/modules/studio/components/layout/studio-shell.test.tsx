import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { StudioShell, studioNavItems } from "./studio-shell";

/**
 * [70] The shell carries EXACTLY three nav items — Tổng quan (/), Build
 * (/build), Dự án (/catalog). The standalone AI-analysis page is gone:
 * /agent must not appear in the nav at all (it is now a server redirect to
 * /build). The header also hosts the readiness cluster (state chip + "Kiểm
 * tra" button); rendered here against the context default ("Chưa kiểm tra")
 * since the provider lives in the root layout.
 */

vi.mock("next/navigation", () => ({
   usePathname: () => "/build",
}));

afterEach(() => {
   vi.restoreAllMocks();
});

describe("StudioShell nav — the three [70] menu items", () => {
   it("declares exactly the three nav entries with their hrefs", () => {
      expect(studioNavItems).toEqual([
         { href: "/", label: "Tổng quan" },
         { href: "/build", label: "Build" },
         { href: "/catalog", label: "Dự án" },
      ]);
   });

   it("renders exactly three menu items as real Next links", () => {
      render(
         <StudioShell>
            <p>page content</p>
         </StudioShell>,
      );
      const menu = screen.getByRole("menu", { name: "Studio" });
      const items = within(menu).getAllByRole("menuitem");
      expect(items).toHaveLength(3);

      const expectations: [string, string][] = [
         ["Tổng quan", "/"],
         ["Build", "/build"],
         ["Dự án", "/catalog"],
      ];
      for (const [label, href] of expectations) {
         const link = screen.getByRole("link", { name: label });
         expect(link).toHaveAttribute("href", href);
         expect(within(menu).getByRole("link", { name: label })).toBe(link);
      }
   });

   it("has NO /agent nav item — the link and the label are both gone", () => {
      render(
         <StudioShell>
            <p>page content</p>
         </StudioShell>,
      );
      expect(screen.queryByRole("link", { name: "Phân tích AI" })).toBeNull();
      expect(document.querySelectorAll('a[href="/agent"]')).toHaveLength(0);
      expect(screen.queryByText("Phân tích AI")).toBeNull();
   });

   it("highlights the current pathname exactly (no partial matches)", () => {
      render(
         <StudioShell>
            <p>page content</p>
         </StudioShell>,
      );
      const menu = screen.getByRole("menu", { name: "Studio" });
      const selected = within(menu)
         .getAllByRole("menuitem")
         .filter((item) => item.classList.contains("ant-menu-item-selected"));
      expect(selected).toHaveLength(1);
      expect(
         within(selected[0]).getByRole("link", { name: "Build" }),
      ).toBeTruthy();
   });
});

describe("StudioShell header readiness cluster", () => {
   it("hosts the readiness chip and the Kiểm tra button in the header", () => {
      render(
         <StudioShell>
            <p>page content</p>
         </StudioShell>,
      );
      // Context default (no provider in this test): "Chưa kiểm tra".
      expect(screen.getByText("Chưa kiểm tra")).toBeInTheDocument();
      expect(
         screen.getByRole("button", { name: "Kiểm tra" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Kiểm tra" })).toBeEnabled();
   });
});
