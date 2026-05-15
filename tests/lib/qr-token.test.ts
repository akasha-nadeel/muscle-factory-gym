import { describe, it, expect } from "vitest";
import { signKioskToken, verifyKioskToken } from "@/lib/qr/token";

const SECRET = "test-secret-dev-only-never-use-in-prod";

describe("signKioskToken / verifyKioskToken", () => {
  it("verifies a fresh token signed with the same secret", async () => {
    const now = new Date("2026-05-15T12:00:00Z");
    const token = await signKioskToken({
      kioskId: "main",
      now,
      secret: SECRET,
    });
    const result = await verifyKioskToken({
      token,
      now,
      secret: SECRET,
      maxAgeSeconds: 24 * 60 * 60,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kioskId).toBe("main");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signKioskToken({
      kioskId: "main",
      now: new Date("2026-05-15T12:00:00Z"),
      secret: SECRET,
    });
    const result = await verifyKioskToken({
      token,
      now: new Date("2026-05-15T12:00:00Z"),
      secret: "different-secret",
      maxAgeSeconds: 24 * 60 * 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });

  it("rejects a tampered payload", async () => {
    const token = await signKioskToken({
      kioskId: "main",
      now: new Date("2026-05-15T12:00:00Z"),
      secret: SECRET,
    });
    const parts = token.split(".");
    // Change kioskId from "main" to "evil"
    const tampered = `evil.${parts[1]}.${parts[2]}`;
    const result = await verifyKioskToken({
      token: tampered,
      now: new Date("2026-05-15T12:00:00Z"),
      secret: SECRET,
      maxAgeSeconds: 24 * 60 * 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_signature");
  });

  it("rejects an expired token (>maxAge seconds old)", async () => {
    const signedAt = new Date("2026-05-15T00:00:00Z");
    const checkedAt = new Date("2026-05-16T01:00:00Z"); // 25h later
    const token = await signKioskToken({
      kioskId: "main",
      now: signedAt,
      secret: SECRET,
    });
    const result = await verifyKioskToken({
      token,
      now: checkedAt,
      secret: SECRET,
      maxAgeSeconds: 24 * 60 * 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("token_expired");
  });

  it("rejects a future-dated token (iat clock skew > 60s)", async () => {
    const signedAt = new Date("2026-05-15T12:05:00Z");
    const checkedAt = new Date("2026-05-15T12:00:00Z"); // 5 min before sign
    const token = await signKioskToken({
      kioskId: "main",
      now: signedAt,
      secret: SECRET,
    });
    const result = await verifyKioskToken({
      token,
      now: checkedAt,
      secret: SECRET,
      maxAgeSeconds: 24 * 60 * 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("token_future");
  });

  it("rejects malformed token (wrong number of segments)", async () => {
    const result = await verifyKioskToken({
      token: "not-a-real-token",
      now: new Date(),
      secret: SECRET,
      maxAgeSeconds: 24 * 60 * 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("rejects empty iat segment as malformed (not invalid_signature)", async () => {
    const result = await verifyKioskToken({
      token: "main..somesig",
      now: new Date(),
      secret: SECRET,
      maxAgeSeconds: 24 * 60 * 60,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed");
  });

  it("rejects non-decimal iat (hex, scientific notation, whitespace) as malformed", async () => {
    const cases = ["0x10", "1.5e3", " 1234 ", "-1", "1.0"];
    for (const iatStr of cases) {
      const result = await verifyKioskToken({
        token: `main.${iatStr}.somesig`,
        now: new Date(),
        secret: SECRET,
        maxAgeSeconds: 24 * 60 * 60,
      });
      expect(result.ok, `iatStr=${JSON.stringify(iatStr)}`).toBe(false);
      if (!result.ok) {
        expect(result.reason, `iatStr=${JSON.stringify(iatStr)}`).toBe("malformed");
      }
    }
  });
});
