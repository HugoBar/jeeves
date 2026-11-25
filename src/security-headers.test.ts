import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("the security headers", () => {
  it("leave out X-Powered-By", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("go on every response", async () => {
    const rules = await nextConfig.headers!();
    expect(rules.map((rule) => rule.source)).toEqual(["/:path*"]);
  });

  it("stop sniffing, outside referrers, camera, microphone, location and framing", async () => {
    const [rule] = await nextConfig.headers!();
    expect(Object.fromEntries((rule?.headers ?? []).map(({ key, value }) => [key, value]))).toEqual({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
    });
  });
});
