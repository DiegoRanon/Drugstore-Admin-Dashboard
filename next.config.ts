import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Routes that render patient information. Their documents must never be cached
 * by a browser, a proxy, or a CDN (PRD 8.2).
 */
const PII_ROUTES = [
  "/",
  // Counts only, no patient data — but still private authenticated content,
  // and misclassifying downward is the risky direction.
  "/calendar",
  "/orders/:path*",
  "/clients/:path*",
  "/drivers/:path*",
  "/invites/:path*",
  "/settings/:path*",
];

const nextConfig: NextConfig = {
  // Pin the workspace root: the sibling server repo has its own lockfile and
  // Turbopack would otherwise guess a parent directory.
  turbopack: { root: import.meta.dirname },

  // Keep the previous caching model: `dynamic = "force-dynamic"` and
  // `cache: "no-store"` stay available, and nothing is prerendered by accident.
  // Enabling Cache Components would change both and is not wanted here.
  cacheComponents: false,

  // No `experimental.staleTimes`: the Next 16 default for dynamic segments is
  // already 0s, so the client Router Cache cannot serve a previous patient's
  // detail on back-navigation.

  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      ...PII_ROUTES.map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      })),
    ];
  },
};

export default withNextIntl(nextConfig);
