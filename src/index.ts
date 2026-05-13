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
 * All env vars are optional — credentials can be passed per-call as tool parameters.
 *
 * Optional env vars (used as fallback when params are omitted):
 *   ONAIR_API_KEY     - Your OnAir API key
 *   ONAIR_COMPANY_ID  - Your company GUID
 *   ONAIR_VA_ID       - Your Virtual Airline GUID
 *   PORT              - HTTP port (default: 3000, only used with TRANSPORT=http)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { registerFleetTools } from "./tools/fleet.js";
import { registerMissionTools } from "./tools/missions.js";
import { registerAirportTools } from "./tools/airports.js";
import { registerCompanyTools } from "./tools/company.js";
import { requestContext } from "./request-context.js";

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
      "INFO: ONAIR_API_KEY not set. Credentials must be passed per-call via tool parameters."
    );
  }
  if (!process.env.ONAIR_COMPANY_ID) {
    console.error(
      "INFO: ONAIR_COMPANY_ID not set. Company-scoped tools will require company_id parameter."
    );
  }
  if (!process.env.ONAIR_VA_ID) {
    console.error(
      "INFO: ONAIR_VA_ID not set. VA tools will require va_id parameter."
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
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "onair-mcp-server", version: "1.0.0" });
  });

  // MCP endpoint — stateless: new transport + server per request
  app.post("/mcp", async (req, res) => {
    await requestContext.run({ headers: req.headers }, async () => {
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
    });
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`OnAir MCP server running on http://0.0.0.0:${port}/mcp`);
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
