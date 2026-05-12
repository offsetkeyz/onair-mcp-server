# OnAir MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the [OnAir Airline Manager](https://www.onair.company/) REST API as MCP tools. Connect it to Claude (desktop or web) and query your virtual airline — fleet, finances, flights, jobs, employees, FBOs, and more — conversationally.

## Features

- **24 read-only tools** covering company, fleet, missions, airports, flights, financials, and Virtual Airlines
- **Dual transport**: stdio (local) or Streamable HTTP (remote/cloud)
- **Per-call credentials**: API key, company ID, and VA ID can be passed as tool parameters from the Claude UI — no secrets baked into the server
- **Docker-ready**: multi-stage Dockerfile included

## Quick Start

### Prerequisites

- Node.js 20+ (or Docker)
- An [OnAir](https://www.onair.company/) account with API access
- Your **API Key** and **Company ID** from the OnAir desktop client (Settings, bottom-left)

### Run Locally (stdio)

```bash
git clone https://github.com/<your-username>/onair-mcp-server.git
cd onair-mcp-server
npm install
npm run build
npm start
```

By default the server starts in `stdio` mode, suitable for `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "onair": {
      "command": "node",
      "args": ["<path-to>/onair-mcp-server/dist/index.js"],
      "env": {
        "ONAIR_API_KEY": "<your-api-key>",
        "ONAIR_COMPANY_ID": "<your-company-guid>"
      }
    }
  }
}
```

### Run Remotely (HTTP) — Docker on a VM

This is the recommended path for use with Claude custom connectors (desktop app or web).

```bash
# On your VM with Docker installed:
git clone https://github.com/<your-username>/onair-mcp-server.git
cd onair-mcp-server

# Build the image
docker build -t onair-mcp .

# Run — no env vars required if you'll pass credentials per-call from Claude
docker run -d --name onair-mcp -p 3000:3000 onair-mcp

# Or, set env vars as defaults so you don't have to pass them every call:
docker run -d --name onair-mcp -p 3000:3000 \
  -e ONAIR_API_KEY=<your-api-key> \
  -e ONAIR_COMPANY_ID=<your-company-guid> \
  onair-mcp
```

Health check: `curl http://<vm-ip>:3000/health`

MCP endpoint: `http://<vm-ip>:3000/mcp`

> **Production note**: Put a reverse proxy (Caddy, nginx) in front for TLS. Claude custom connectors require HTTPS in production.

### CLI Agent Deployment Script

If you're deploying via a CLI agent on a VM with Docker already installed, here's the full sequence:

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/onair-mcp-server.git
cd onair-mcp-server

# 2. Build the Docker image
docker build -t onair-mcp .

# 3. Stop any existing container
docker rm -f onair-mcp 2>/dev/null || true

# 4. Run (credentials passed per-call from Claude, no env vars needed)
docker run -d --name onair-mcp -p 3000:3000 --restart unless-stopped onair-mcp

# 5. Verify
curl -s http://localhost:3000/health | jq .
# Expected: {"status":"ok","server":"onair-mcp-server","version":"1.0.0"}
```

## Connecting to Claude

### Claude Desktop App or Web (Custom Connector)

1. Open Claude **Settings** > **Connectors**
2. Click **Add Connector**
3. Set the URL to `https://<your-domain>/mcp` (must be HTTPS)
4. Save and enable

Credentials flow through tool parameters — when Claude calls a tool, it passes `api_key`, `company_id`, etc. as part of the request. No secrets are stored on the server.

## Environment Variables

All optional. Tool parameters override these when provided.

| Variable | Description |
|---|---|
| `ONAIR_API_KEY` | OnAir API key (fallback if not passed per-call) |
| `ONAIR_COMPANY_ID` | Company GUID (fallback if not passed per-call) |
| `ONAIR_VA_ID` | Virtual Airline GUID (fallback for VA tools) |
| `TRANSPORT` | `stdio` (default) or `http` |
| `PORT` | HTTP listen port (default: `3000`) |

## Tools Reference

### Company & Financials

| Tool | Description |
|---|---|
| `onair_get_company` | Company name, ICAO, level, reputation, cash, world |
| `onair_get_company_dashboard` | Flights, revenue, active jobs, fleet size |
| `onair_get_company_employees` | Pilots/crew list with salary, location, hours |
| `onair_get_employee` | Single employee details by GUID |
| `onair_get_company_fbos` | FBOs — fuel stock, capacity, fees |
| `onair_get_company_cash_flow` | Income/expense transactions |
| `onair_get_company_balance_sheet` | Assets, liabilities, net worth |
| `onair_get_company_income_statement` | Revenue/expense breakdown (date range) |
| `onair_get_company_notifications` | Recent events and alerts |

### Fleet

| Tool | Description |
|---|---|
| `onair_get_company_fleet` | All aircraft — type, reg, airport, condition |
| `onair_get_aircraft` | Single aircraft details by GUID |
| `onair_get_aircraft_flights` | Flight history for an aircraft |
| `onair_get_aircraft_maintenance_costs` | Maintenance cost breakdown |
| `onair_get_aircraft_economic_details` | Market value, revenue, profitability |
| `onair_get_aircraft_at_airport` | Aircraft parked at an ICAO code |

### Missions & Maintenance

| Tool | Description |
|---|---|
| `onair_get_company_jobs` | Pending or completed jobs/missions |
| `onair_get_fbo_jobs` | Jobs generated by a specific FBO |
| `onair_get_company_work_orders` | Fleet-wide maintenance work orders |
| `onair_get_aircraft_work_orders` | Work orders for a specific aircraft |

### Airports, Flights & VA

| Tool | Description |
|---|---|
| `onair_get_airport` | Airport details by ICAO code |
| `onair_get_flight` | Completed flight details by GUID |
| `onair_get_company_flights` | Paginated company flight history |
| `onair_get_virtual_airline` | VA overview — name, members, level |
| `onair_get_va_members` | VA member list with stats |
| `onair_get_va_flights` | Recent flights across all VA members |

## Project Structure

```
onair-mcp-server/
├── src/
│   ├── index.ts          # Entry point — stdio or HTTP transport
│   ├── api-client.ts     # OnAir API client with per-call auth
│   ├── constants.ts      # API base URL, limits
│   ├── schemas.ts        # Shared Zod schemas for tool params
│   └── tools/
│       ├── company.ts    # Company, employees, financials, VA tools
│       ├── fleet.ts      # Fleet and aircraft tools
│       ├── missions.ts   # Jobs, FBO jobs, work orders
│       └── airports.ts   # Airport, flight, company flights tools
├── Dockerfile
├── tsconfig.json
└── package.json
```

## API Reference

All tools are read-only and hit `https://server1.onair.company/api/v1/`. Auth is via the `oa-apikey` header. See the [OnAir API docs](https://server1.onair.company/swagger/docs/v1) and [VAMSApp/onair-api](https://github.com/VAMSApp/onair-api) for response schemas.

## Development

```bash
npm install
npm run dev     # Watch mode with tsx
npm run build   # Compile TypeScript
npm start       # Run compiled output
```

## License

MIT
