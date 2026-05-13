import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";

export interface RequestContext {
  headers: IncomingHttpHeaders;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getHeader(name: string): string | undefined {
  const headers = requestContext.getStore()?.headers;
  if (!headers) return undefined;
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}
