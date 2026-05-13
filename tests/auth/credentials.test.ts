import { describe, it, expect, beforeEach } from "vitest";
import { resolveCredentials } from "../../src/api-client.js";
import { requestContext } from "../../src/request-context.js";

beforeEach(() => {
  delete process.env.ONAIR_API_KEY;
  delete process.env.ONAIR_COMPANY_ID;
  delete process.env.ONAIR_VA_ID;
});

describe("resolveCredentials in HTTP transport mode", () => {
  it("uses JWT claim and ignores tool params, headers, and env", () => {
    const ctx = {
      transport: "http" as const,
      headers: { "oa-apikey": "from-header" },
      auth: {
        token: "t",
        clientId: "c",
        scopes: [],
        extra: { onair_api_key: "from-jwt", onair_company_id: "co-jwt" },
      },
    };
    process.env.ONAIR_API_KEY = "from-env";

    requestContext.run(ctx, () => {
      const creds = resolveCredentials({
        api_key: "from-param",
        company_id: "from-param-co",
      });
      expect(creds.apiKey).toBe("from-jwt");
      expect(creds.companyId).toBe("co-jwt");
    });
  });

  it("throws if JWT claim is missing in HTTP mode (no fallback)", () => {
    const ctx = {
      transport: "http" as const,
      headers: { "oa-apikey": "from-header" },
      auth: { token: "t", clientId: "c", scopes: [], extra: {} },
    };
    process.env.ONAIR_API_KEY = "from-env";

    requestContext.run(ctx, () => {
      expect(() => resolveCredentials({ api_key: "from-param" })).toThrow(
        /OAuth/i
      );
    });
  });
});

describe("resolveCredentials in stdio transport mode", () => {
  it("retains the legacy fallback chain", () => {
    const ctx = {
      transport: "stdio" as const,
      headers: {},
    };
    requestContext.run(ctx, () => {
      const creds = resolveCredentials({ api_key: "from-param" });
      expect(creds.apiKey).toBe("from-param");
    });
  });

  it("falls back to oa-apikey header when no param given", () => {
    const ctx = {
      transport: "stdio" as const,
      headers: { "oa-apikey": "from-header" },
    };
    requestContext.run(ctx, () => {
      const creds = resolveCredentials({});
      expect(creds.apiKey).toBe("from-header");
    });
  });

  it("falls back to ONAIR_API_KEY env when no param or header given", () => {
    process.env.ONAIR_API_KEY = "from-env";
    const ctx = { transport: "stdio" as const, headers: {} };
    requestContext.run(ctx, () => {
      const creds = resolveCredentials({});
      expect(creds.apiKey).toBe("from-env");
    });
    delete process.env.ONAIR_API_KEY;
  });
});
