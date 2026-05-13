import { describe, it, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { OnAirOAuthProvider, _resetJwtSecretForTesting } from "../../src/auth/provider.js";

describe("OnAirOAuthProvider.verifyAccessToken", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "x".repeat(64);
    _resetJwtSecretForTesting();
  });

  it("rejects a token signed with a different algorithm than HS256", async () => {
    const provider = new OnAirOAuthProvider();
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({ onair_api_key: "k" })
      .setProtectedHeader({ alg: "HS512" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .setSubject("c")
      .sign(secret);
    await expect(provider.verifyAccessToken(token)).rejects.toThrow();
  });

  it("warns on short JWT_SECRET", async () => {
    process.env.JWT_SECRET = "short";
    _resetJwtSecretForTesting();
    const warnings: string[] = [];
    const origErr = console.error;
    console.error = (m: string) => warnings.push(m);
    try {
      await new OnAirOAuthProvider()
        .verifyAccessToken("not-a-token")
        .catch(() => {});
    } finally {
      console.error = origErr;
    }
    expect(warnings.some((w) => /JWT_SECRET.*short|weak|brute/i.test(w))).toBe(true);
  });
});
