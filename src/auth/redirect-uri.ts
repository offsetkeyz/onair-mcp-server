import { InvalidClientMetadataError } from "@modelcontextprotocol/sdk/server/auth/errors.js";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function validateRedirectUris(uris: unknown): void {
  if (!Array.isArray(uris) || uris.length === 0) {
    throw new InvalidClientMetadataError("redirect_uris must contain at least one URI.");
  }
  for (const raw of uris) {
    if (typeof raw !== "string") {
      throw new InvalidClientMetadataError("redirect_uris entries must be strings.");
    }
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new InvalidClientMetadataError(`Invalid redirect_uri: ${raw}`);
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new InvalidClientMetadataError(
        `Disallowed redirect_uri scheme '${url.protocol}'. Only https (or http://localhost) is permitted.`
      );
    }
    if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
      throw new InvalidClientMetadataError(
        `redirect_uri must use https (got http on non-loopback host: ${url.hostname}).`
      );
    }
    if (url.hash) {
      throw new InvalidClientMetadataError("redirect_uri must not contain a fragment.");
    }
  }
}
