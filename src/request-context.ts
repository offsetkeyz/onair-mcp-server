import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export interface RequestContext {
  headers: IncomingHttpHeaders;
  auth?: AuthInfo;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getHeader(name: string): string | undefined {
  const headers = requestContext.getStore()?.headers;
  if (!headers) return undefined;
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Get a credential from the OAuth JWT token's extra claims.
 * These are set during the OAuth consent flow when the user enters their OnAir creds.
 */
export function getAuthClaim(key: string): string | undefined {
  const extra = requestContext.getStore()?.auth?.extra;
  if (!extra) return undefined;
  const value = extra[key];
  return typeof value === "string" ? value : undefined;
}
