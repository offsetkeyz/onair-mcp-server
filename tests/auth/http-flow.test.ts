import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { OnAirOAuthProvider } from "../../src/auth/provider.js";
import { installOAuthRoutes } from "../../src/auth/routes.js";

function buildApp() {
  const provider = new OnAirOAuthProvider();
  const app = express();
  installOAuthRoutes(app, provider, new URL("http://localhost:3000"));
  return { app, provider };
}

async function registerAndAuthorize(app: express.Express, redirect: string) {
  const reg = await request(app)
    .post("/register")
    .send({ redirect_uris: [redirect], client_name: "test-client" });
  expect(reg.status).toBe(201);
  const clientId = reg.body.client_id;
  const clientSecret = reg.body.client_secret;

  // Drive /authorize. Compute PKCE S256 challenge for verifier.
  const verifier = "verifier-verifier-verifier-verifier-verifier";
  const { createHash } = await import("node:crypto");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const authRes = await request(app).get("/authorize").query({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirect,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  expect(authRes.status).toBe(200);

  // Extract authId and csrfToken from HTML
  const html = authRes.text;
  const authId = /name="auth_id" value="([0-9a-f]+)"/.exec(html)![1];
  const csrfToken = /name="csrf_token" value="([0-9a-f]+)"/.exec(html)![1];
  const cookie = authRes.headers["set-cookie"][0];
  return { clientId, clientSecret, authId, csrfToken, cookie, verifier };
}

describe("consent flow security", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "x".repeat(64);
  });

  it("rejects POST /oauth/consent without cookie", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/oauth/consent")
      .type("form")
      .send({ auth_id: "deadbeef", api_key: "k", csrf_token: "z" });
    expect(res.status).toBe(403);
  });

  it("rejects POST /oauth/consent when csrf_token != cookie", async () => {
    const { app } = buildApp();
    const { authId, cookie } = await registerAndAuthorize(
      app,
      "https://x.example/cb"
    );
    const res = await request(app)
      .post("/oauth/consent")
      .set("Cookie", cookie)
      .type("form")
      .send({ auth_id: authId, api_key: "k", csrf_token: "wrong" });
    expect(res.status).toBe(403);
  });

  it("rejects an authId initiated by a different browser (no matching cookie)", async () => {
    const { app } = buildApp();
    const { authId, csrfToken } = await registerAndAuthorize(
      app,
      "https://x.example/cb"
    );
    // Victim browser has no cookie for this authId.
    const res = await request(app)
      .post("/oauth/consent")
      .type("form")
      .send({ auth_id: authId, api_key: "k", csrf_token: csrfToken });
    expect(res.status).toBe(403);
  });

  it("rejects DCR with javascript: redirect_uri", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/register")
      .send({ redirect_uris: ["javascript:alert(1)"] });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("renders client_name and redirect_uri in consent page", async () => {
    const { app } = buildApp();
    const reg = await request(app)
      .post("/register")
      .send({
        redirect_uris: ["https://x.example/cb"],
        client_name: "Evil-Co",
      });
    expect(reg.status).toBe(201);
    const verifier = "v".repeat(43);
    const { createHash } = await import("node:crypto");
    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    const authRes = await request(app).get("/authorize").query({
      response_type: "code",
      client_id: reg.body.client_id,
      redirect_uri: "https://x.example/cb",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    expect(authRes.text).toContain("Evil-Co");
    expect(authRes.text).toContain("https://x.example/cb");
  });

  it("succeeds when cookie and csrf_token match", async () => {
    const { app } = buildApp();
    const { authId, csrfToken, cookie } = await registerAndAuthorize(
      app,
      "https://x.example/cb"
    );
    const res = await request(app)
      .post("/oauth/consent")
      .set("Cookie", cookie)
      .type("form")
      .send({
        auth_id: authId,
        api_key: "real-key",
        company_id: "co",
        csrf_token: csrfToken,
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/x\.example\/cb\?code=/);
  });

  it("issued code is redeemable at /token (end-to-end happy path)", async () => {
    const { app } = buildApp();
    const { authId, csrfToken, cookie, verifier, clientId, clientSecret } =
      await registerAndAuthorize(app, "https://x.example/cb");

    const consentRes = await request(app)
      .post("/oauth/consent")
      .set("Cookie", cookie)
      .type("form")
      .send({ auth_id: authId, api_key: "k", company_id: "c", csrf_token: csrfToken });
    expect(consentRes.status).toBe(302);
    const code = /code=([0-9a-f]+)/.exec(consentRes.headers.location)![1];

    const tokenRes = await request(app)
      .post("/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "https://x.example/cb",
        code_verifier: verifier,
      });
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body).toHaveProperty("access_token");
  });
});
