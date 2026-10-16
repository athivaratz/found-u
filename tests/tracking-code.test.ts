import { describe, expect, test } from "bun:test";
import {
  canViewReporterContacts,
  normalizeTrackingCode,
  trackingStatusHint,
} from "../lib/tracking-code";
import { generateTrackingCode } from "../lib/utils";

describe("normalizeTrackingCode", () => {
  test("canonicalizes case, spaces, and underscores", () => {
    expect(normalizeTrackingCode(" lost-abc234 ")).toEqual({
      ok: true,
      code: "LOST-ABC234",
      kind: "lost",
    });
    expect(normalizeTrackingCode("FOUND_KLMNP2")).toEqual({
      ok: true,
      code: "FOUND-KLMNP2",
      kind: "found",
    });
    expect(normalizeTrackingCode("found - 234567")).toEqual({
      ok: true,
      code: "FOUND-234567",
      kind: "found",
    });
  });

  test("accepts codes produced by generateTrackingCode", () => {
    const lost = generateTrackingCode("lost");
    const found = generateTrackingCode("found");
    expect(normalizeTrackingCode(lost)).toMatchObject({ ok: true, code: lost, kind: "lost" });
    expect(normalizeTrackingCode(found.toLowerCase())).toMatchObject({
      ok: true,
      code: found,
      kind: "found",
    });
  });

  test("rejects empty, short, and ambiguous characters", () => {
    expect(normalizeTrackingCode("   ").ok).toBe(false);
    expect(normalizeTrackingCode("").message).toContain("กรุณากรอก");
    expect(normalizeTrackingCode("LOST-ABC23").ok).toBe(false);
    expect(normalizeTrackingCode("LOST-ABC2345").ok).toBe(false);
    expect(normalizeTrackingCode("LOST-ABC23O").ok).toBe(false);
    expect(normalizeTrackingCode("FOUND-ABC230").ok).toBe(false);
    expect(normalizeTrackingCode("IMP-ABC234").ok).toBe(false);
    expect(normalizeTrackingCode("LOST-ABC23I").message).toContain("LOST-");
  });
});

describe("trackingStatusHint", () => {
  test("uses different copy for a lost item that was found versus a found report at the office", () => {
    expect(trackingStatusHint("lost", "found")).toContain("ติดต่อรับคืน");
    expect(trackingStatusHint("found", "found")).toContain("เจ้าของสามารถมารับคืน");
    expect(trackingStatusHint("found", "pending_room_confirm")).toContain("จุดส่งมอบ");
    expect(trackingStatusHint("found", "expired")).toContain("หมดอายุ");
  });
});

describe("canViewReporterContacts", () => {
  test("shows contacts only to the owner or an admin", () => {
    expect(
      canViewReporterContacts({ isAdmin: false, viewerId: "a", ownerId: "b" })
    ).toBe(false);
    expect(
      canViewReporterContacts({ isAdmin: false, viewerId: "a", ownerId: "a" })
    ).toBe(true);
    expect(
      canViewReporterContacts({ isAdmin: true, viewerId: "a", ownerId: "b" })
    ).toBe(true);
    expect(
      canViewReporterContacts({ isAdmin: false, viewerId: null, ownerId: "b" })
    ).toBe(false);
  });
});
