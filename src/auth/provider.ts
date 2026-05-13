/**
 * OAuth 2.1 Server Provider for the OnAir MCP Server.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

interface PendingAuth {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  state?: string;
  scopes?: string[];
  onairApiKey?: string;
  onairCompanyId?: string;
  onairVaId?: string;
  expiresAt: number;
}

const clients = new Map<string, OAuthClientInformationFull>();
const pendingAuths = new Map<string, PendingAuth>();
const revokedTokens = new Set<string>();

let jwtSecret: Uint8Array;

function getJwtSecret(): Uint8Array {
  if (!jwtSecret) {
    const envSecret = process.env.JWT_SECRET;
    if (envSecret) {
      jwtSecret = new TextEncoder().encode(envSecret);
    } else {
      jwtSecret = randomBytes(32);
      console.error(
        "WARNING: Using auto-generated JWT secret. Tokens will not survive server restarts. Set JWT_SECRET env var for persistence."
      );
    }
  }
  return jwtSecret;
}

class OnAirClientsStore implements OAuthRegisteredClientsStore {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return clients.get(clientId);
  }

  registerClient(
    client: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">
  ): OAuthClientInformationFull {
    const full: OAuthClientInformationFull = {
      ...client,
      client_id: randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    clients.set(full.client_id, full);
    return full;
  }
}

export class OnAirOAuthProvider implements OAuthServerProvider {
  private _clientsStore = new OnAirClientsStore();

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    const authId = randomBytes(16).toString("hex");
    pendingAuths.set(authId, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      state: params.state,
      scopes: params.scopes,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    res.type("html").send(consentPage(authId));
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const pending = pendingAuths.get(authorizationCode);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error("Invalid or expired authorization code");
    }
    return pending.codeChallenge;
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    const pending = pendingAuths.get(authorizationCode);
    if (!pending || pending.expiresAt < Date.now()) {
      throw new Error("Invalid or expired authorization code");
    }
    if (!pending.onairApiKey) {
      throw new Error("Authorization was not completed");
    }
    pendingAuths.delete(authorizationCode);

    const secret = getJwtSecret();
    const accessToken = await new SignJWT({
      onair_api_key: pending.onairApiKey,
      onair_company_id: pending.onairCompanyId || undefined,
      onair_va_id: pending.onairVaId || undefined,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("365d")
      .setSubject(pending.clientId)
      .setJti(randomUUID())
      .sign(secret);

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 365 * 24 * 60 * 60,
    };
  }

  async exchangeRefreshToken(): Promise<OAuthTokens> {
    throw new Error("Refresh tokens are not supported");
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (revokedTokens.has(token)) {
      throw new Error("Token has been revoked");
    }
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return {
      token,
      clientId: payload.sub || "unknown",
      scopes: ["onair:read"],
      expiresAt: payload.exp,
      extra: {
        onair_api_key: payload.onair_api_key as string,
        onair_company_id: payload.onair_company_id as string | undefined,
        onair_va_id: payload.onair_va_id as string | undefined,
      },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    revokedTokens.add(request.token);
  }

  completeAuthorization(
    authId: string,
    onairApiKey: string,
    onairCompanyId?: string,
    onairVaId?: string
  ): { redirectUri: string; code: string; state?: string } | null {
    const pending = pendingAuths.get(authId);
    if (!pending || pending.expiresAt < Date.now()) {
      return null;
    }
    pending.onairApiKey = onairApiKey;
    pending.onairCompanyId = onairCompanyId;
    pending.onairVaId = onairVaId;
    return {
      redirectUri: pending.redirectUri,
      code: authId,
      state: pending.state,
    };
  }
}

function consentPage(authId: string): string {
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width,initial-scale=1"/>\n<title>OnAir MCP - Authorize</title>\n<style>\n*{box-sizing:border-box;margin:0;padding:0}\nbody{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:1rem}\n.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:2rem;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.3)}\nh1{font-size:1.25rem;margin-bottom:.25rem;color:#f8fafc}\n.sub{font-size:.85rem;color:#94a3b8;margin-bottom:1.5rem}\nlabel{display:block;font-size:.8rem;font-weight:600;color:#94a3b8;margin-bottom:.25rem;text-transform:uppercase;letter-spacing:.05em}\ninput{width:100%;padding:.6rem .75rem;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#f1f5f9;font-size:.9rem;margin-bottom:1rem;outline:none}\ninput:focus{border-color:#3b82f6}\ninput::placeholder{color:#64748b}\n.req{color:#ef4444}\n.opt{color:#64748b;font-weight:400;font-size:.75rem}\nbtn,button{width:100%;padding:.7rem;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-size:.95rem;font-weight:600;cursor:pointer;margin-top:.5rem}\nbutton:hover{background:#2563eb}\n.help{font-size:.75rem;color:#64748b;margin-top:1rem;text-align:center}\n</style>\n</head>\n<body>\n<div class="card">\n<h1>Connect to OnAir</h1>\n<p class="sub">Enter your OnAir credentials to authorize Claude.</p>\n<form method="POST" action="/oauth/consent">\n<input type="hidden" name="auth_id" value="' + authId + '"/>\n<label>API Key <span class="req">*</span></label>\n<input type="password" name="api_key" required placeholder="e.g. a1b2c3d4-e5f6-..." autocomplete="off"/>\n<label>Company ID <span class="req">*</span></label>\n<input type="text" name="company_id" required placeholder="e.g. 7d69917d-f015-..." autocomplete="off"/>\n<label>VA ID <span class="opt">(optional)</span></label>\n<input type="text" name="va_id" placeholder="e.g. 12345678-abcd-..." autocomplete="off"/>\n<button type="submit">Authorize</button>\n</form>\n<p class="help">Find these in Settings (bottom-left) in the OnAir desktop client.</p>\n</div>\n</body>\n</html>';
}
