import type { Metadata } from "next";

/**
 * [61] Server-safe studio metadata, split out of `studio-shell.tsx`.
 *
 * The shell became a `'use client'` component (it needs `usePathname` for the
 * active-route highlight), and a server component must not import non-component
 * exports from a `'use client'` module — so `app/layout.tsx` reads
 * `studioMetadata` from this directive-free module instead. Keep this file free
 * of client imports and React component exports.
 */
export const studioMetadata: Metadata = {
  title: {
    default: "DET Studio",
    template: "%s · DET Studio",
  },
  description:
    "Giao diện nội bộ dành cho vận hành viên: xem lại, xem trước và xuất nội dung CMS.",
};
