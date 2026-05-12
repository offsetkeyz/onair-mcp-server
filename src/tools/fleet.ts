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

export function registerFleetTools(server: McpServer): void {
  server.registerTool(
    "onair_get_company_fleet",
    {
      title: "Get Company Fleet",
      description: `List all aircraft owned, leased, or rented by your OnAir company.

Returns each aircraft's identifier, type, registration, current airport (ICAO), condition percentages,
fuel on board, total flight hours, and ownership status.`,
      inputSchema: {
        api_key: apiKeyParam,
        company_id: companyIdParam,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        const fleet = await onairGet<unknown[]>(`company/${cid}/fleet`, creds.apiKey);

        const text = JSON.stringify(fleet, null, 2);
        if (text.length > CHARACTER_LIMIT) {
          const summary = (fleet as Array<Record<string, unknown>>).map((a) => ({
            Id: a.Id,
            AircraftType: a.AircraftType,
            Identifier: a.Identifier,
            CurrentAirport: a.CurrentAirport,
            AirframeConditionPercent: a.AirframeConditionPercent,
          }));
          return {
            content: [
              {
                type: "text" as const,
                text: `Fleet has ${fleet.length} aircraft (summary — full response truncated):\n${JSON.stringify(summary, null, 2)}`,
              },
            ],
          };
        }
        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_aircraft",
    {
      title: "Get Aircraft Details",
      description: `Fetch detailed information about a specific aircraft by its GUID.

Returns type, registration, current airport, condition percentages, fuel, hours, payload, and ownership.`,
      inputSchema: {
        aircraft_id: guidParam("aircraft"),
        api_key: apiKeyParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const data = await onairGet<unknown>(`aircraft/${params.aircraft_id}`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_aircraft_flights",
    {
      title: "Get Aircraft Flights",
      description: `List completed flights for a specific aircraft. Returns departure/arrival, distance, time, score, and landing rating.`,
      inputSchema: {
        aircraft_id: guidParam("aircraft"),
        api_key: apiKeyParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const flights = await onairGet<unknown[]>(`aircraft/${params.aircraft_id}/flights`, creds.apiKey);
        const text = JSON.stringify(flights, null, 2);
        return {
          content: [{
            type: "text" as const,
            text: text.length > CHARACTER_LIMIT
              ? `${flights.length} flights. Showing first 10:\n${JSON.stringify(flights.slice(0, 10), null, 2)}`
              : text,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_aircraft_maintenance_costs",
    {
      title: "Get Aircraft Maintenance Costs",
      description: `Fetch maintenance cost breakdown for a specific aircraft (100h inspection, annual, engine overhaul, etc.).`,
      inputSchema: {
        aircraft_id: guidParam("aircraft"),
        api_key: apiKeyParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const data = await onairGet<unknown>(`aircraft/${params.aircraft_id}/maintenancecosts`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_aircraft_economic_details",
    {
      title: "Get Aircraft Economic Details",
      description: `Fetch economic/financial details for an aircraft — market value, revenue, costs, and profitability.`,
      inputSchema: {
        aircraft_id: guidParam("aircraft"),
        api_key: apiKeyParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const data = await onairGet<unknown>(`aircraft/${params.aircraft_id}/economicdetails`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_aircraft_at_airport",
    {
      title: "Get Aircraft at Airport",
      description: `List aircraft currently parked at a specific airport by ICAO code.`,
      inputSchema: {
        icao_code: icaoParam,
        api_key: apiKeyParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const data = await onairGet<unknown[]>(`aircraft/${params.icao_code.toUpperCase()}/airport`, creds.apiKey);
        return {
          content: [{
            type: "text" as const,
            text: data.length ? JSON.stringify(data, null, 2) : `No aircraft found at ${params.icao_code.toUpperCase()}.`,
          }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );
}
