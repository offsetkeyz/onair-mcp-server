import { describe, it, expect } from "vitest";
import { generateCsrfToken, safeEqual } from "../../src/auth/csrf.js";

describe("csrf helpers", () => {
  it("generates 32-byte hex tokens", () => {
    const t = generateCsrfToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns true for equal strings", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
  });

  it("returns false for unequal strings", () => {
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    expect(safeEqual(undefined as unknown as string, "abc")).toBe(false);
    expect(safeEqual("abc", null as unknown as string)).toBe(false);
  });
});
