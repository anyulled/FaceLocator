import type { NextRequest } from "next/server";

export type AdminIdentity = {
  sub: string;
  tokenUse: "id" | "access";
  groups: string[];
  username: string | null;
};

type JwtHeader = {
  alg?: string;
  kid?: string;
};

type JwtPayload = {
  sub?: string;
  iss?: string;
  exp?: number;
  nbf?: number;
  aud?: string | string[];
  client_id?: string;
  token_use?: "id" | "access";
  username?: string;
  "cognito:groups"?: string[] | string;
};

type JwksResponse = {
  keys?: (JsonWebKey & { kid?: string })[];
};

const JWKS_TTL_MS = 5 * 60 * 1000;
const ADMIN_GROUP = "admin";

let jwksCache: { fetchedAt: number; keys: (JsonWebKey & { kid?: string })[] } | null = null;
const DEFAULT_PUBLIC_BASE_URL = "http://localhost:3000";

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

export function getCognitoIssuer() {
  const explicitIssuer = readEnv("COGNITO_ISSUER", "NEXT_PUBLIC_COGNITO_ISSUER");
  if (explicitIssuer) {
    return explicitIssuer;
  }

  const userPoolId = readEnv("COGNITO_USER_POOL_ID", "NEXT_PUBLIC_COGNITO_USER_POOL_ID");
  if (!userPoolId) {
    return "";
  }

  const region = userPoolId.split("_")[0];
  if (!region) {
    return "";
  }

  return `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}

export function getCognitoClientId() {
  return readEnv("COGNITO_APP_CLIENT_ID", "NEXT_PUBLIC_COGNITO_APP_CLIENT_ID");
}

function getPublicBaseUrl() {
  return (
    readEnv("FACE_LOCATOR_PUBLIC_BASE_URL", "NEXT_PUBLIC_FACE_LOCATOR_PUBLIC_BASE_URL") ||
    DEFAULT_PUBLIC_BASE_URL
  );
}

export function getCognitoHostedDomain() {
  const explicitDomain = readEnv("COGNITO_DOMAIN", "NEXT_PUBLIC_COGNITO_DOMAIN");
  if (explicitDomain) {
    return explicitDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }

  const issuer = getCognitoIssuer();
  const poolId = issuer.split("/").at(-1);
  if (!poolId) {
    return "";
  }

  const region = poolId.split("_")[0];
  if (!region) {
    return "";
  }

  const domainPrefix = readEnv("COGNITO_DOMAIN_PREFIX", "NEXT_PUBLIC_COGNITO_DOMAIN_PREFIX");
  return domainPrefix
    ? `${domainPrefix}.auth.${region}.amazoncognito.com`
    : "";
}

export function getCognitoLoginRedirectUri() {
  return `${getPublicBaseUrl()}/api/admin/callback`;
}

export function getCognitoLogoutRedirectUri() {
  return `${getPublicBaseUrl()}/`;
}

function bytesToBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes).map((byte) => String.fromCharCode(byte)).join("");
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary =
    typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeAdminAuthState(redirectPath: string) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ redirectPath })));
}

export function decodeAdminAuthState(state: string | null | undefined) {
  if (!state) {
    return null;
  }

  try {
    const decoded = new TextDecoder().decode(base64UrlToBytes(state));
    const parsed = JSON.parse(decoded) as { redirectPath?: string };
    if (parsed.redirectPath && parsed.redirectPath.startsWith("/")) {
      return parsed.redirectPath;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildCognitoAuthorizeUrl(redirectPath: string) {
  const domain = getCognitoHostedDomain();
  const clientId = getCognitoClientId();
  const redirectUri = getCognitoLoginRedirectUri();

  if (!domain || !clientId || !redirectUri) {
    return "";
  }

  const url = new URL(`https://${domain}/login`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", encodeAdminAuthState(redirectPath));

  return url.toString();
}

export function buildCognitoLogoutUrl() {
  const domain = getCognitoHostedDomain();
  const clientId = getCognitoClientId();
  const logoutUri = getCognitoLogoutRedirectUri();

  if (!domain || !clientId || !logoutUri) {
    return "";
  }

  const url = new URL(`https://${domain}/logout`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("logout_uri", logoutUri);
  return url.toString();
}

export function isCognitoHostedUiConfigured() {
  return Boolean(getCognitoHostedDomain() && getCognitoClientId());
}

export function isCognitoAdminAuthConfigured() {
  return getCognitoIssuer().length > 0 && getCognitoClientId().length > 0;
}

function extractBearerToken(authorizationHeader: string | null) {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

function extractJwtFromRequest(request: NextRequest) {
  const headerToken = extractBearerToken(request.headers.get("authorization"));
  if (headerToken) {
    return headerToken;
  }

  return (
    request.cookies.get("idToken")?.value ??
    request.cookies.get("accessToken")?.value ??
    null
  );
}

function decodeBase64UrlSegment(segment: string) {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padding = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  if (typeof atob === "function") {
    const binary = atob(base64 + padding);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  const buffer = Buffer.from(base64 + padding, "base64");
  return new Uint8Array(buffer);
}

function parseJwtPart<T>(segment: string): T | null {
  try {
    const bytes = decodeBase64UrlSegment(segment);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function normalizeGroups(groups: JwtPayload["cognito:groups"]) {
  if (Array.isArray(groups)) {
    return groups.map((group) => String(group));
  }

  if (typeof groups === "string" && groups.length > 0) {
    return [groups];
  }

  return [];
}

async function loadJwks(issuer: string): Promise<(JsonWebKey & { kid?: string })[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }

  const response = await fetch(`${issuer}/.well-known/jwks.json`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Cognito JWKS");
  }

  const body = (await response.json()) as JwksResponse;
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache = { fetchedAt: now, keys };
  return keys;
}

async function verifySignature(token: string, key: JsonWebKey) {
  const segments = token.split(".");
  const signingInput = `${segments[0]}.${segments[1]}`;
  const signature = decodeBase64UrlSegment(segments[2]);
  const signingInputBytes = new TextEncoder().encode(signingInput);

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["verify"],
  );

  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, signingInputBytes);
}

export async function resolveAdminIdentity(request: NextRequest): Promise<AdminIdentity | null> {
  const issuer = getCognitoIssuer();
  if (!issuer) {
    return null;
  }

  const token = extractJwtFromRequest(request);
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const header = parseJwtPart<JwtHeader>(parts[0]);
  const payload = parseJwtPart<JwtPayload>(parts[1]);

  if (!header || !payload) {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) {
    return null;
  }

  if (payload.iss !== issuer) {
    return null;
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowInSeconds) {
    return null;
  }

  if (typeof payload.nbf === "number" && payload.nbf > nowInSeconds) {
    return null;
  }

  if (payload.token_use !== "id" && payload.token_use !== "access") {
    return null;
  }

  const clientId = getCognitoClientId();
  if (clientId) {
    if (payload.token_use === "id") {
      if (Array.isArray(payload.aud)) {
        if (!payload.aud.includes(clientId)) {
          return null;
        }
      } else if (payload.aud !== clientId) {
        return null;
      }
    } else if (payload.client_id !== clientId) {
      return null;
    }
  }

  const jwks = await loadJwks(issuer);
  const key = jwks.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    return null;
  }

  const signatureValid = await verifySignature(token, key);
  if (!signatureValid) {
    return null;
  }

  const groups = normalizeGroups(payload["cognito:groups"]);
  if (!groups.includes(ADMIN_GROUP)) {
    return null;
  }

  if (!payload.sub) {
    return null;
  }

  return {
    sub: payload.sub,
    tokenUse: payload.token_use,
    groups,
    username: payload.username ?? null,
  };
}

export async function isAuthorizedAdminRequest(request: NextRequest) {
  const identity = await resolveAdminIdentity(request);
  return Boolean(identity);
}
