import { createRemoteJWKSet, jwtVerify } from "jose";
import { actorBySubject, actorForMcpToken } from "./accounts";

export const resourceMetadataPath = "/.well-known/oauth-protected-resource/api/mcp";
export const resourceUrl = process.env.WORKSHAPE_PUBLIC_URL ? new URL("/api/mcp", process.env.WORKSHAPE_PUBLIC_URL).href : undefined;
export const issuer = process.env.MCP_OAUTH_ISSUER;
const jwksUrl = process.env.MCP_OAUTH_JWKS_URL;
const keySet = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl), { timeoutDuration: 5000 }) : undefined;

export function allowsMcpOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (resourceUrl) return origin === new URL(resourceUrl).origin;
  try {
    return origin === new URL(request.url).origin && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export async function verifyMcpToken(request: Request, token?: string) {
  if (!token) return undefined;
  if (issuer || keySet || resourceUrl) {
    if (!issuer || !keySet || !resourceUrl) return undefined;
    try {
      const { payload } = await jwtVerify(token, keySet, {
        issuer, audience: resourceUrl, requiredClaims: ["sub", "exp"], algorithms: ["RS256", "ES256", "PS256"],
      });
      const actor = actorBySubject(payload.sub!);
      const scopes = typeof payload.scope === "string" ? payload.scope.split(/\s+/) : [];
      return actor ? { token, clientId: String(payload.client_id ?? payload.azp ?? actor.id), scopes,
        extra: { actorId: actor.id } } : undefined;
    } catch {
      return undefined;
    }
  }
  if (process.env.WORKSHAPE_ALLOW_LOCAL_MCP_TOKENS !== "1" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)) return undefined;
  const actor = actorForMcpToken(token);
  return actor ? { token, clientId: actor.id, scopes: ["workshape:access"], extra: { actorId: actor.id } } : undefined;
}
