import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image.
  output: "standalone",
  // The Planner is the home screen until the Home page is built (V1).
  async redirects() {
    return [{ source: "/", destination: "/planner", permanent: false }];
  },
};

export default nextConfig;
