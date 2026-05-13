import { describe, it, expect } from "vitest";
import { validateRedirectUris } from "../../src/auth/redirect-uri.js";
import { InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

describe("validateRedirectUris", () => {
  it("accepts https URLs", () => {
    expect(() =>
      validateRedirectUris(["https://claude.ai/api/mcp/auth_callback"])
    ).not.toThrow();
  });

  it("accepts http://localhost and http://127.0.0.1 for local dev", () => {
    expect(() =>
      validateRedirectUris(["http://localhost:8000/cb", "http://127.0.0.1:3000/cb"])
    ).not.toThrow();
  });

  it("rejects http on non-loopback hosts", () => {
    expect(() => validateRedirectUris(["http://example.com/cb"])).toThrow(
      /https/i
    );
  });

  it("rejects javascript: scheme", () => {
    expect(() => validateRedirectUris(["javascript:alert(1)"])).toThrow(
      /scheme/i
    );
  });

  it("rejects data: scheme", () => {
    expect(() => validateRedirectUris(["data:text/html,xss"])).toThrow(/scheme/i);
  });

  it("rejects file: scheme", () => {
    expect(() => validateRedirectUris(["file:///etc/passwd"])).toThrow(/scheme/i);
  });

  it("rejects URIs containing a fragment", () => {
    expect(() => validateRedirectUris(["https://x.example/cb#frag"])).toThrow(
      /fragment/i
    );
  });

  it("rejects malformed URLs", () => {
    expect(() => validateRedirectUris(["not a url"])).toThrow();
  });

  it("rejects empty array", () => {
    expect(() => validateRedirectUris([])).toThrow(/at least one/i);
  });

  it("throws InvalidClientMetadataError so the SDK returns 400", () => {
    expect(() => validateRedirectUris(["javascript:alert(1)"])).toThrow(
      InvalidClientMetadataError
    );
  });
});
