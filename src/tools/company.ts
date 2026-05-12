import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  onairGet,
  resolveCredentials,
  requireCompanyId,
  requireVaId,
  handleToolError,
} from "../api-client.js";
import { apiKeyParam, companyIdParam, vaIdParam, guidParam } from "../schemas.js";

export function registerCompanyTools(server: McpServer): void {
  server.registerTool(
    "onair_get_company",
    {
      title: "Get Company Details",
      description: `Fetch your OnAir company's core details — name, ICAO, level, reputation, cash balance, world, and stats.`,
      inputSchema: { api_key: apiKeyParam, company_id: companyIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        const data = await onairGet<unknown>(`company/${cid}`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_company_dashboard",
    {
      title: "Get Company Dashboard",
      description: `Quick operational snapshot — total flights, revenue, active jobs, fleet size, recent activity.`,
      inputSchema: { api_key: apiKeyParam, company_id: companyIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        const data = await onairGet<unknown>(`company/${cid}/dashboard`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_company_fbos",
    {
      title: "Get Company FBOs",
      description: `List your FBOs — airport, fuel stock, sell price, hangar/tiedown capacity, and weekly fees.`,
      inputSchema: { api_key: apiKeyParam, company_id: companyIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        const data = await onairGet<unknown[]>(`company/${cid}/fbos`, creds.apiKey);
        return {
          content: [{ type: "text" as const, text: data.length ? JSON.stringify(data, null, 2) : "No FBOs owned." }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_company_employees",
    {
      title: "Get Company Employees",
      description: `List employees (pilots/crew) — name, role, salary, location, and flight hours.`,
      inputSchema: { api_key: apiKeyParam, company_id: companyIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        const data = await onairGet<unknown[]>(`company/${cid}/employees`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_company_cash_flow",
    {
      title: "Get Company Cash Flow",
      description: `Fetch cash flow records — income/expense transactions with amounts, account codes, and timestamps.`,
      inputSchema: { api_key: apiKeyParam, company_id: companyIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        const data = await onairGet<unknown[]>(`company/${cid}/cashflow`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_company_balance_sheet",
    {
      title: "Get Company Balance Sheet",
      description: `Snapshot of financial health — assets, liabilities, equity, cash, aircraft value, loans, net worth.`,
      inputSchema: { api_key: apiKeyParam, company_id: companyIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        const data = await onairGet<unknown>(`company/${cid}/balancesheet`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_company_income_statement",
    {
      title: "Get Company Income Statement",
      description: `Revenue/expense breakdown for a date range. Defaults to last 30 days. Dates in ISO 8601 format.`,
      inputSchema: {
        start_date: z.string().optional().describe("Start date (ISO 8601, e.g. 2026-01-01T00:00:00). Default: 30 days ago."),
        end_date: z.string().optional().describe("End date (ISO 8601). Default: now."),
        api_key: apiKeyParam,
        company_id: companyIdParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        let endpoint = `company/${cid}/incomestatement`;
        if (params.start_date && params.end_date) {
          endpoint += `/${params.start_date}/${params.end_date}`;
        }
        const data = await onairGet<unknown>(endpoint, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_company_notifications",
    {
      title: "Get Company Notifications",
      description: `Recent notifications — completed flights, expired jobs, maintenance reminders, financial events.`,
      inputSchema: { api_key: apiKeyParam, company_id: companyIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const cid = requireCompanyId(creds);
        const data = await onairGet<unknown[]>(`company/${cid}/notifications`, creds.apiKey);
        return {
          content: [{ type: "text" as const, text: data.length ? JSON.stringify(data, null, 2) : "No recent notifications." }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_employee",
    {
      title: "Get Employee Details",
      description: `Fetch details for a specific employee by GUID — name, role, salary, location, hours, assignment.`,
      inputSchema: {
        employee_id: guidParam("employee"),
        api_key: apiKeyParam,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const data = await onairGet<unknown>(`employee/${params.employee_id}`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_virtual_airline",
    {
      title: "Get Virtual Airline Details",
      description: `Fetch VA overview — name, owner, member count, level, reputation, and settings.`,
      inputSchema: { api_key: apiKeyParam, va_id: vaIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const vid = requireVaId(creds);
        const data = await onairGet<unknown>(`va/${vid}`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_va_members",
    {
      title: "Get VA Members",
      description: `List Virtual Airline members — name, company, role, join date, flight stats.`,
      inputSchema: { api_key: apiKeyParam, va_id: vaIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const vid = requireVaId(creds);
        const data = await onairGet<unknown[]>(`va/${vid}/members`, creds.apiKey);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );

  server.registerTool(
    "onair_get_va_flights",
    {
      title: "Get VA Flights",
      description: `List recent flights across all Virtual Airline members.`,
      inputSchema: { api_key: apiKeyParam, va_id: vaIdParam },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (params) => {
      try {
        const creds = resolveCredentials(params);
        const vid = requireVaId(creds);
        const data = await onairGet<unknown[]>(`va/${vid}/flights`, creds.apiKey);
        return {
          content: [{ type: "text" as const, text: data.length ? JSON.stringify(data, null, 2) : "No VA flights found." }],
        };
      } catch (error) {
        return { content: [{ type: "text" as const, text: handleToolError(error) }], isError: true };
      }
    }
  );
}
