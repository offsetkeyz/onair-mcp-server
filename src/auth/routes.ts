import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import type { OnAirOAuthProvider } from "./provider.js";
import { safeEqual } from "./csrf.js";

export const CSRF_COOKIE = "onair_csrf";
export const COOKIE_TTL_MS = 10 * 60 * 1000;

export function installOAuthRoutes(
  app: Express,
  provider: OnAirOAuthProvider,
  serverUrl: URL
): void {
  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  // Mount mcpAuthRouter which handles discovery, registration, /authorize, /token endpoints.
  // provider.authorize() is called by the router for GET /authorize and sets the CSRF cookie.
  app.use(
    mcpAuthRouter({
      provider,
      issuerUrl: serverUrl,
      baseUrl: serverUrl,
      serviceDocumentationUrl: new URL(
        "https://github.com/offsetkeyz/onair-mcp-server"
      ),
      scopesSupported: ["onair:read"],
    })
  );

  app.post("/oauth/consent", (req, res) => {
    const { auth_id, api_key, company_id, va_id, csrf_token } = req.body ?? {};
    const cookieToken = req.cookies?.[CSRF_COOKIE];

    if (!auth_id || !api_key) {
      res.status(400).send("Missing required fields.");
      return;
    }
    if (!cookieToken || !csrf_token || !safeEqual(cookieToken, csrf_token)) {
      res.status(403).send("CSRF check failed. Restart the authorization.");
      return;
    }

    const result = provider.completeAuthorization(
      auth_id,
      csrf_token, // bind: only this browser's authId+token pair is valid
      api_key,
      company_id || undefined,
      va_id || undefined
    );

    if (!result) {
      res.status(400).send("Authorization expired or invalid. Please try again.");
      return;
    }

    res.clearCookie(CSRF_COOKIE);
    const redirectUrl = new URL(result.redirectUri);
    redirectUrl.searchParams.set("code", result.code);
    if (result.state) redirectUrl.searchParams.set("state", result.state);
    res.redirect(302, redirectUrl.toString());
  });
}
