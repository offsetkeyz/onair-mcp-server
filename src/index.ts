#!/usr/bin/env node
/**
 * OnAir MCP Server
 *
 * MCP server for the OnAir Airline Manager API.
 * Provides tools to query fleet, missions, airports, flights,
 * company financials, and Virtual Airline data.
 *
 * Supports two transport modes:
 *   TRANSPORT=stdio  (default) — for local use with Claude Desktop config
 *   TRANSPORT=http   — for remote hosting as a Claude custom connector
 *
 * In HTTP mode, authentication uses OAuth 2.1:
 *   - Claude discovers OAuth endpoints automatically
 *   - User authenticates by entering OnAir creds in a consent form
 *   - Server issues JWT tokens containing the OnAir credentials
 *   - Claude sends Bearer token on every request
 *
 * Optional env vars:
 *   ONAIR_API_KEY     - Fallback OnAir API key (for stdio or header-based auth)
 *   ONAIR_COMPANY_ID  - Fallback company GUID
 *   ONAIR_VA_ID       - Fallback VA GUID
 *   JWT_SECRET        - Secret for signing OAuth JWTs (auto-generated if unset)
 *   PORT              - HTTP port (default: 3000)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { getOAuthProtectedResourceMetadataUrl } from "@modelcontextprotocol/sdk/server/auth/router.js";
import express from "express";
import { registerFleetTools } from "./tools/fleet.js";
import { registerMissionTools } from "./tools/missions.js";
import { registerAirportTools } from "./tools/airports.js";
import { registerCompanyTools } from "./tools/company.js";
import { requestContext } from "./request-context.js";
import { OnAirOAuthProvider } from "./auth/provider.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "onair-mcp-server",
    version: "1.0.0",
  });

  registerFleetTools(server);
  registerMissionTools(server);
  registerAirportTools(server);
  registerCompanyTools(server);

  return server;
}

function logEnvStatus(): void {
  if (!process.env.ONAIR_API_KEY) {
    console.error(
      "INFO: ONAIR_API_KEY not set. Credentials must come via OAuth or tool parameters."
    );
  }
  if (!process.env.ONAIR_COMPANY_ID) {
    console.error(
      "INFO: ONAIR_COMPANY_ID not set. Company-scoped tools will require company_id parameter."
    );
  }
  if (!process.env.JWT_SECRET) {
    console.error(
      "INFO: JWT_SECRET not set. A random secret will be generated (tokens won't survive restarts)."
    );
  }
}

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OnAir MCP server running via stdio");
}

async function runHTTP(): Promise<void> {
  const app = express();

  const port = parseInt(process.env.PORT || "3000", 10);
  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  const serverUrl = new URL(baseUrl);

  // ── OAuth provider ────────────────────────────────────────────────
  const oauthProvider = new OnAirOAuthProvider();

  // Install OAuth routes at app root (/.well-known/*, /authorize, /token, /register)
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: serverUrl,
      baseUrl: serverUrl,
      serviceDocumentationUrl: new URL(
        "https://github.com/offsetkeyz/onair-mcp-server"
      ),
      scopesSupported: ["onair:read"],
    })
  );

  // ── Consent form POST handler ─────────────────────────────────────
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.post("/oauth/consent", (req, res) => {
    const { auth_id, api_key, company_id, va_id } = req.body;

    if (!auth_id || !api_key) {
      res.status(400).send("Missing required fields.");
      return;
    }

    const result = oauthProvider.completeAuthorization(
      auth_id,
      api_key,
      company_id || undefined,
      va_id || undefined
    );

    if (!result) {
      res.status(400).send("Authorization expired or invalid. Please try again.");
      return;
    }

    // Redirect back to Claude with the authorization code
    const redirectUrl = new URL(result.redirectUri);
    redirectUrl.searchParams.set("code", result.code);
    if (result.state) {
      redirectUrl.searchParams.set("state", result.state);
    }

    res.redirect(302, redirectUrl.toString());
  });

  // ── Health check ──────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "onair-mcp-server", version: "1.0.0" });
  });

  // ── Bearer auth middleware for MCP endpoint ───────────────────────
  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(
    new URL("/mcp", serverUrl)
  );

  const bearerAuth = requireBearerAuth({
    verifier: oauthProvider,
    resourceMetadataUrl,
  });

  // ── MCP endpoint — stateless, OAuth-protected ─────────────────────
  app.post("/mcp", bearerAuth, async (req, res) => {
    await requestContext.run(
      { headers: req.headers, auth: req.auth },
      async () => {
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });

        res.on("close", () => {
          transport.close();
        });

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      }
    );
  });

  app.listen(port, () => {
    console.error(`OnAir MCP server running on ${baseUrl}/mcp`);
    console.error(`OAuth authorize: ${baseUrl}/authorize`);
    console.error(`Health check: ${baseUrl}/health`);
  });
}

// --- Entry point ---
logEnvStatus();

const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
  runHTTP().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
