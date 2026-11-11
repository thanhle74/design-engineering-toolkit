import type { NextConfig } from "next";

/**
 * [61] Tailwind was removed with the stock-antd correction: there is no
 * Turbopack CSS loader rule — Next's built-in CSS handling covers the single
 * minimal `globals.css`.
 */
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
