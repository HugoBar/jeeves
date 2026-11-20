import type { NextConfig } from "next";

// Sent on every response. Only `frame-ancestors` is set in the CSP: a full
// script policy would need nonces on every page, for little gain in an app
// that renders no outside content.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The Planner is the home screen until the Home page is built (V1).
  async redirects() {
    return [{ source: "/", destination: "/planner", permanent: false }];
  },
};

export default nextConfig;
