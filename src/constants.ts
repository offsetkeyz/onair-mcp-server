export const API_BASE_URL = "https://server1.onair.company/api/v1";
export const CHARACTER_LIMIT = 25000;

export const WORLDS = ["cumulus", "stratus", "thunder"] as const;
export type World = (typeof WORLDS)[number];
