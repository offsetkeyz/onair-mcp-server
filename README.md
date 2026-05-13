# OnAir MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the [OnAir Airline Manager](https://www.onair.company/) REST API as MCP tools. Connect it to Claude (desktop or web) and query your virtual airline — fleet, finances, flights, jobs, employees, FBOs, and more — conversationally.

## Features

- **24 read-only tools** covering company, fleet, missions, airports, flights, financials, and Virtual Airlines
- **Dual transport**: stdio (local) or Streamable HTTP (remote/cloud)
- **OAuth 2.1 authentication**: standard PKCE flow with a built-in consent form — enter your OnAir credentials once and Claude handles the rest
- **OAuth-only credentials in HTTP mode**: when running as a remote MCP server, the JWT issued by the OAuth flow is the sole credential source. Tool-param, header, and env-var credential fallbacks apply only to stdio (single-tenant local) deployments.
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
git clone https://github.com/offsetkeyz/onair-mcp-server.git
cd onair-mcp-server

# Build the image
docker build -t onair-mcp .

# Generate a persistent JWT secret (save this — tokens survive restarts only if it stays the same)
export JWT_SECRET=$(openssl rand -hex 32)

# Run with OAuth enabled
docker run -d --name onair-mcp -p 3000:3000 \
  -e TRANSPORT=http \
  -e BASE_URL=https://<your-domain> \
  -e JWT_SECRET=$JWT_SECRET \
  --restart unless-stopped onair-mcp
```

`BASE_URL` must match the public URL that Claude will use to reach the server. The OAuth discovery metadata references this URL for all endpoints.

Health check: `curl https://<your-domain>/health`

MCP endpoint: `https://<your-domain>/mcp`

> **Production note**: Put a reverse proxy (Caddy, nginx) in front for TLS. Claude custom connectors require HTTPS in production.

### CLI Agent Deployment Script

If you're deploying via a CLI agent on a VM with Docker already installed, here's the full sequence:

```bash
# 1. Clone the repo
git clone https://github.com/offsetkeyz/onair-mcp-server.git
cd onair-mcp-server

# 2. Build the Docker image
docker build -t onair-mcp .

# 3. Stop any existing container
docker rm -f onair-mcp 2>/dev/null || true

# 4. Run with OAuth and persistent JWT secret
docker run -d --name onair-mcp -p 3000:3000 \
  -e TRANSPORT=http \
  -e BASE_URL=https://<your-domain> \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  --restart unless-stopped onair-mcp

# 5. Verify health and OAuth discovery
curl -s https://<your-domain>/health | jq .
curl -s https://<your-domain>/.well-known/oauth-authorization-server | jq .
```

## Connecting to Claude

### Claude Desktop App or Web (Custom Connector)

1. Open Claude **Settings** > **Connectors**
2. Click **Add Connector**
3. Set the URL to `https://<your-domain>/mcp` (must be HTTPS)
4. Save and enable

On the first tool call, Claude will discover the OAuth endpoints automatically, redirect you to the consent form, and prompt you to enter your OnAir API Key and Company ID. After authorization, Claude receives a JWT token and uses it for all subsequent requests — no credentials need to be passed as tool parameters.

> **Breaking change (2026-05-13):** In HTTP transport, the `api_key`, `company_id`, and `va_id` tool parameters are ignored; credentials must come from the OAuth flow. If your existing project instructions paste these as tool params, remove them — Claude will obtain credentials automatically after re-running consent.

### Authentication Flow

The server implements OAuth 2.1 with PKCE (S256), which is the MCP specification standard:

1. Claude hits `/mcp` and gets a 401
2. Claude discovers OAuth metadata at `/.well-known/oauth-authorization-server`
3. Claude dynamically registers a client at `/register`
4. Claude redirects you to `/authorize`, which serves a consent form
5. You enter your OnAir API Key, Company ID, and optionally VA ID
6. The server issues an authorization code and redirects back to Claude
7. Claude exchanges the code for a JWT at `/token`
8. The JWT contains your OnAir credentials and is sent as a Bearer token on every request

Tokens are valid for 365 days. Credentials are resolved in priority order: tool parameters (explicit per-call) → JWT claims (from OAuth) → HTTP headers → server environment variables.

## Environment Variables

All optional unless noted. Tool parameters and OAuth tokens override these when provided.

| Variable | Description |
|---|---|
| `TRANSPORT` | `stdio` (default) or `http` |
| `PORT` | HTTP listen port (default: `3000`) |
| `BASE_URL` | Public URL of the server (required for HTTP mode, e.g. `https://onair.example.com`). Used in OAuth discovery metadata. |
| `JWT_SECRET` | Secret for signing OAuth JWTs. If unset, a random secret is generated on startup (tokens won't survive container restarts). |
| `ONAIR_API_KEY` | OnAir API key (lowest-priority fallback) |
| `ONAIR_COMPANY_ID` | Company GUID (lowest-priority fallback) |
| `ONAIR_VA_ID` | Virtual Airline GUID (lowest-priority fallback) |

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
│   ├── index.ts            # Entry point — stdio or HTTP transport, OAuth routes
│   ├── api-client.ts       # OnAir API client with 4-tier credential resolution
│   ├── request-context.ts  # AsyncLocalStorage for per-request headers + auth
│   ├── constants.ts        # API base URL, limits
│   ├── schemas.ts          # Shared Zod schemas for tool params
│   ├── auth/
│   │   └── provider.ts     # OAuth 2.1 provider — consent form, JWT signing, token verification
│   └── tools/
│       ├── company.ts      # Company, employees, financials, VA tools
│       ├── fleet.ts        # Fleet and aircraft tools
│       ├── missions.ts     # Jobs, FBO jobs, work orders
│       └── airports.ts     # Airport, flight, company flights tools
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
