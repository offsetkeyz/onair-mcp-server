import axios, { AxiosError } from "axios";
import { API_BASE_URL } from "./constants.js";
import { getHeader, getAuthClaim } from "./request-context.js";

/**
 * OnAir API responses wrap data in { Content: T, Error?: string }
 */
interface OnAirResponse<T> {
  Content: T;
  Error?: string;
}

/**
 * Per-request credentials. Tool params override env-var defaults.
 */
export interface OnAirCredentials {
  apiKey: string;
  companyId?: string;
  vaId?: string;
}

/**
 * Resolve credentials in priority order:
 *   1. Tool parameters (explicit per-call)
 *   2. OAuth JWT claims (from Bearer token, set during consent flow)
 *   3. HTTP request headers (oa-apikey, x-onair-company-id, x-onair-va-id)
 *   4. Server environment variables
 */
export function resolveCredentials(params: {
  api_key?: string;
  company_id?: string;
  va_id?: string;
}): OnAirCredentials {
  const apiKey =
    params.api_key ||
    getAuthClaim("onair_api_key") ||
    getHeader("oa-apikey") ||
    process.env.ONAIR_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No API key provided. Authenticate via OAuth, pass api_key as a parameter, or set ONAIR_API_KEY on the server."
    );
  }

  return {
    apiKey,
    companyId:
      params.company_id ||
      getAuthClaim("onair_company_id") ||
      getHeader("x-onair-company-id") ||
      process.env.ONAIR_COMPANY_ID,
    vaId:
      params.va_id ||
      getAuthClaim("onair_va_id") ||
      getHeader("x-onair-va-id") ||
      process.env.ONAIR_VA_ID,
  };
}

export function requireCompanyId(creds: OnAirCredentials): string {
  if (!creds.companyId) {
    throw new Error(
      "No company ID available. Pass company_id as a parameter or set ONAIR_COMPANY_ID on the server."
    );
  }
  return creds.companyId;
}

export function requireVaId(creds: OnAirCredentials): string {
  if (!creds.vaId) {
    throw new Error(
      "No VA ID available. Pass va_id as a parameter or set ONAIR_VA_ID on the server."
    );
  }
  return creds.vaId;
}

export async function onairGet<T>(
  endpoint: string,
  apiKey: string
): Promise<T> {
  try {
    const response = await axios.get<OnAirResponse<T>>(
      `${API_BASE_URL}/${endpoint}`,
      {
        headers: {
          "oa-apikey": apiKey,
          Accept: "application/json",
        },
        timeout: 30000,
      }
    );

    if (response.data.Error) {
      throw new Error(response.data.Error);
    }

    return response.data.Content;
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.response) {
        const status = error.response.status;
        const detail =
          typeof error.response.data === "object" && error.response.data?.Error
            ? error.response.data.Error
            : error.response.statusText;

        switch (status) {
          case 400:
            throw new Error(
              `Bad request: ${detail}. Check that the ID or code you provided is correct.`
            );
          case 401:
            throw new Error(
              "Authentication failed. Check that your API key is valid."
            );
          case 403:
            throw new Error(
              "Permission denied. Your API key does not have access to this resource."
            );
          case 404:
            throw new Error(
              `Resource not found: ${detail}. Verify the ID or airport code exists.`
            );
          case 429:
            throw new Error(
              "Rate limit exceeded. Wait a moment before making more requests."
            );
          default:
            throw new Error(`OnAir API error (${status}): ${detail}`);
        }
      } else if (error.code === "ECONNABORTED") {
        throw new Error(
          "Request timed out connecting to OnAir API. Try again."
        );
      } else if (error.code === "ECONNREFUSED") {
        throw new Error(
          "Could not connect to OnAir API. The server may be down for maintenance."
        );
      }
    }

    throw error instanceof Error
      ? error
      : new Error(`Unexpected error: ${String(error)}`);
  }
}

export function handleToolError(error: unknown): string {
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Error: ${String(error)}`;
}
