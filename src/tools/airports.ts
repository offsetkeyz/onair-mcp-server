import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  onairGet,
  resolveCredentials,
  requireCompanyId,
  handleToolError,
} from "../api-client.js";
import { apiKeyParam, companyIdParam, guidParam, icaoParam } from "../schemas.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerAirportTools(server: McpServer): void {
  server.registerTool(
    "onair_get_airport",
    {
      title: "Get Airport Details",
      description: `Fetch details for an airport by ICAO code. Returns name, location, elevation, Size (0-5),
runways, parking types, military flag, and simulator availability.`,
      inputSchema: {
        icao_code: icaoParam,
        api_key: apiKeyParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const data = await onairGet<unknown>(`airport/${params.icao_code.toUpperCase()}`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_flight",
    {
      title: "Get Flight Details",
      description: `Fetch detailed info about a completed flight by GUID. Returns airports, aircraft, distance,
block time, fuel used, landing rating (A-E), and flight score breakdown.`,
      inputSchema: {
        flight_id: guidParam("flight"),
        api_key: apiKeyParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const data = await onairGet<unknown>(`flight/${params.flight_id}`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_company_flights",
    {
      title: "Get Company Flights",
      description: `List recent flights for your company with pagination. Default page size is 20.`,
      inputSchema: {
        page: z.number().int().min(1).default(1).describe("Page number (starts at 1)."),
        limit: z.number().int().min(1).max(100).default(20).describe("Flights per page (max 100)."),
        api_key: apiKeyParam,
        company_id: companyIdParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        const flights = await onairGet<unknown[]>(
          `company/${cid}/flights?page=${params.page}&limit=${params.limit}`,
          creds.apiKey
        );
        const text = JSON.stringify(flights, null, 2);
        return {
          content: [{
            type: "text" as const,
            text: flights.length
              ? (text.length > CHARACTER_LIMIT
                  ? `Page ${params.page}: ${flights.length} flights. First 10:\n${JSON.stringify(flights.slice(0, 10), null, 2)}`
                  : `Page ${params.page}: ${flights.length} flights\n${text}`)
              : `No flights on page ${params.page}.`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );
}
