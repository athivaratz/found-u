import { describe, expect, test } from "bun:test";
import { canonicalizeReturnPath, isAllowedReturnPath } from "../lib/auth-return-to";

describe("return path after login", () => {
  test("keeps a tracking code query on an allowed page", () => {
    const path = "/tracking?code=FOUND-ABC234";
    expect(isAllowedReturnPath(path)).toBe(true);
    expect(canonicalizeReturnPath(path)).toBe(path);
    expect(canonicalizeReturnPath("/tracking?code=LOST-ABC234#top")).toBe(
      "/tracking?code=LOST-ABC234"
    );
  });

  test("still allows nested routes that already included a query", () => {
    expect(canonicalizeReturnPath("/nfc/found?tag=ABC234567890")).toBe(
      "/nfc/found?tag=ABC234567890"
    );
  });

  test("collapses the retired list route and drops its query", () => {
    expect(canonicalizeReturnPath("/list?tab=lost")).toBe("/home");
    expect(canonicalizeReturnPath("/list/items")).toBe("/home");
  });

  test("rejects off-site and auth targets", () => {
    expect(isAllowedReturnPath("https://evil.example/tracking")).toBe(false);
    expect(isAllowedReturnPath("//evil.example")).toBe(false);
    expect(isAllowedReturnPath("/\\evil.example")).toBe(false);
    expect(isAllowedReturnPath("/tracking\n?code=LOST-ABC234")).toBe(false);
    expect(isAllowedReturnPath("/auth/login?returnTo=/tracking")).toBe(false);
    expect(isAllowedReturnPath("/setup")).toBe(false);
    expect(canonicalizeReturnPath("https://evil.example")).toBeNull();
  });
});
