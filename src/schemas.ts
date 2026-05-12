import { z } from "zod";

export const GUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Optional API key — passed per-call from Claude, falls back to server env var. */
export const apiKeyParam = z
  .string()
  .optional()
  .describe(
    "Your OnAir API key. If the server has ONAIR_API_KEY set, you can omit this."
  );

/** Optional company ID — passed per-call from Claude, falls back to server env var. */
export const companyIdParam = z
  .string()
  .regex(GUID_REGEX, "Must be a valid GUID")
  .optional()
  .describe(
    "Your company GUID. If the server has ONAIR_COMPANY_ID set, you can omit this."
  );

/** Optional VA ID — passed per-call, falls back to server env var. */
export const vaIdParam = z
  .string()
  .regex(GUID_REGEX, "Must be a valid GUID")
  .optional()
  .describe(
    "Your Virtual Airline GUID. If the server has ONAIR_VA_ID set, you can omit this."
  );

/** GUID param for entity lookups. */
export const guidParam = (label: string) =>
  z
    .string()
    .regex(GUID_REGEX, "Must be a valid GUID (UUID format)")
    .describe(`The ${label}'s unique identifier (GUID).`);

/** ICAO code param. */
export const icaoParam = z
  .string()
  .min(3)
  .max(5)
  .describe("ICAO airport code (e.g., KLAX, EGLL, LFPG).");
