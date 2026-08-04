import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Headers are platform-applied from vercel.json. This test keeps the contract
// in the repo so a deleted or drifted header fails CI, not a pentest.

function loadRule() {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), "vercel.json"), "utf8"),
  ) as { headers?: { source: string; headers: { key: string; value: string }[] }[] };
  return config.headers?.find((h) => h.source === "/(.*)");
}

const HOUSE_SET = [
  "Content-Security-Policy",
  "Strict-Transport-Security",
  "X-Content-Type-Options",
  "Referrer-Policy",
  "X-Frame-Options",
  "Permissions-Policy",
  "Cross-Origin-Opener-Policy",
];

describe("security headers (vercel.json)", () => {
  it("applies a rule to every route", () => {
    expect(loadRule()).toBeDefined();
  });

  it("carries the house seven-header set", () => {
    const rule = loadRule();
    const get = (key: string) => rule?.headers.find((h) => h.key === key)?.value;
    for (const key of HOUSE_SET) expect(get(key), key).toBeTruthy();
    expect(get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("X-Frame-Options")).toBe("DENY");
  });

  it("locks the CSP's dangerous surfaces", () => {
    const rule = loadRule();
    const csp =
      rule?.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
    for (const directive of [
      "default-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
    // PDF parsing is server-side (serverExternalPackages) — the client CSP
    // needs no worker or blob allowances. Keep it that way.
    expect(csp).not.toContain("blob:");
    expect(csp).not.toContain("unsafe-eval");
  });
});
