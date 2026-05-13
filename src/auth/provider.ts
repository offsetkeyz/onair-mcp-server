/**
 * OAuth 2.1 Server Provider for the OnAir MCP Server.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { validateRedirectUris } from "./redirect-uri.js";
import { generateCsrfToken, safeEqual } from "./csrf.js";
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
  clientName?: string;
  codeChallenge: string;
  redirectUri: string;
  state?: string;
  scopes?: string[];
  csrfToken: string;
  authCode?: string;
  onairApiKey?: string;
  onairCompanyId?: string;
  onairVaId?: string;
  expiresAt: number;
}

const clients = new Map<string, OAuthClientInformationFull>();
const pendingAuths = new Map<string, PendingAuth>();
const revokedTokens = new Set<string>();

const MIN_SECRET_BYTES = 32;

let jwtSecret: Uint8Array;

function getJwtSecret(): Uint8Array {
  if (!jwtSecret) {
    const envSecret = process.env.JWT_SECRET;
    if (envSecret) {
      const bytes = new TextEncoder().encode(envSecret);
      if (bytes.length < MIN_SECRET_BYTES) {
        console.error(
          `WARNING: JWT_SECRET is too short (${bytes.length} bytes). ` +
            `Use at least ${MIN_SECRET_BYTES} bytes — tokens may be brute-forceable.`
        );
      }
      jwtSecret = bytes;
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
    validateRedirectUris(client.redirect_uris);
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
    const csrfToken = generateCsrfToken();
    pendingAuths.set(authId, {
      clientId: client.client_id,
      clientName: client.client_name,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      state: params.state,
      scopes: params.scopes,
      csrfToken,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    res.cookie("onair_csrf", csrfToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: res.req.protocol === "https",
      maxAge: 10 * 60 * 1000,
      path: "/",
    });
    const safeClientName = escapeHtml(client.client_name || client.client_id);
    const safeRedirect = escapeHtml(params.redirectUri);
    const safeAuthId = escapeHtml(authId);
    const safeCsrfToken = escapeHtml(csrfToken);
    res
      .type("html")
      .send(consentPage(safeAuthId, safeCsrfToken, safeClientName, safeRedirect));
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
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
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
    submittedCsrfToken: string,
    onairApiKey: string,
    onairCompanyId?: string,
    onairVaId?: string
  ): { redirectUri: string; code: string; state?: string } | null {
    const pending = pendingAuths.get(authId);
    if (!pending || pending.expiresAt < Date.now()) return null;
    if (!safeEqual(pending.csrfToken, submittedCsrfToken)) return null;

    // Decouple the OAuth code from authId: mint a fresh code at consent time.
    const code = randomBytes(32).toString("hex");
    pending.onairApiKey = onairApiKey;
    pending.onairCompanyId = onairCompanyId;
    pending.onairVaId = onairVaId;
    pending.authCode = code;
    pendingAuths.set(code, pending); // make lookups by code work
    pendingAuths.delete(authId);

    return { redirectUri: pending.redirectUri, code, state: pending.state };
  }
}

// Test seam: allows unit tests to reset the cached JWT secret between cases.
export function _resetJwtSecretForTesting(): void {
  jwtSecret = undefined as unknown as Uint8Array;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function consentPage(
  authId: string,
  csrfToken: string,
  clientName: string,
  redirectUri: string
): string {
  return (
    '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"/>' +
    '<title>OnAir MCP - Authorize</title>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:1rem}.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:2rem;max-width:480px;width:100%}h1{font-size:1.25rem;color:#f8fafc}.sub{font-size:.85rem;color:#94a3b8;margin:.5rem 0 1.5rem}.client{background:#0f172a;border:1px solid #334155;border-radius:6px;padding:.75rem;margin-bottom:1.5rem;font-size:.8rem;color:#cbd5e1}.client b{color:#f1f5f9}.client code{display:block;margin-top:.25rem;word-break:break-all;color:#94a3b8;font-size:.75rem}label{display:block;font-size:.8rem;font-weight:600;color:#94a3b8;margin-bottom:.25rem;text-transform:uppercase;letter-spacing:.05em}input{width:100%;padding:.6rem .75rem;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#f1f5f9;font-size:.9rem;margin-bottom:1rem;outline:none}input:focus{border-color:#3b82f6}.req{color:#ef4444}.opt{color:#64748b;font-size:.75rem}button{width:100%;padding:.7rem;background:#3b82f6;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer}button:hover{background:#2563eb}.help{font-size:.75rem;color:#64748b;margin-top:1rem;text-align:center}</style>' +
    '</head><body><div class="card">' +
    '<h1>Authorize access to OnAir</h1>' +
    '<p class="sub">Only proceed if you initiated this from a trusted application.</p>' +
    '<div class="client"><b>Requesting application:</b> ' + clientName +
    '<code>Redirect: ' + redirectUri + '</code></div>' +
    '<form method="POST" action="/oauth/consent">' +
    '<input type="hidden" name="auth_id" value="' + authId + '"/>' +
    '<input type="hidden" name="csrf_token" value="' + csrfToken + '"/>' +
    '<label>API Key <span class="req">*</span></label>' +
    '<input type="password" name="api_key" required autocomplete="off"/>' +
    '<label>Company ID <span class="req">*</span></label>' +
    '<input type="text" name="company_id" required autocomplete="off"/>' +
    '<label>VA ID <span class="opt">(optional)</span></label>' +
    '<input type="text" name="va_id" autocomplete="off"/>' +
    '<button type="submit">Authorize</button>' +
    '</form>' +
    '<p class="help">Find these in Settings (bottom-left) in the OnAir desktop client.</p>' +
    '</div></body></html>'
  );
}
