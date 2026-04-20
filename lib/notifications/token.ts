import { createHmac, timingSafeEqual } from "node:crypto";

type TokenAction = "gallery" | "unsubscribe";

type TokenPayload = {
  sub: string;
  eventId: string;
  faceId: string;
  action: TokenAction;
  exp: number;
};

const DEFAULT_TTL_DAYS = 30;

function getSigningSecret() {
  const secret = process.env.MATCH_LINK_SIGNING_SECRET;
  if (!secret) {
    throw new Error("MATCH_LINK_SIGNING_SECRET is required.");
  }
  return secret;
}

function getTokenTtlSeconds() {
  const configured = Number(process.env.MATCH_LINK_TTL_DAYS ?? DEFAULT_TTL_DAYS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_TTL_DAYS * 24 * 60 * 60;
  }
  return Math.floor(configured * 24 * 60 * 60);
}

function signValue(value: string) {
  return createHmac("sha256", getSigningSecret()).update(value).digest("base64url");
}

function decodePayload(encoded: string): TokenPayload | null {
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as TokenPayload;

    if (
      typeof parsed.sub !== "string" ||
      typeof parsed.eventId !== "string" ||
      typeof parsed.faceId !== "string" ||
      (parsed.action !== "gallery" && parsed.action !== "unsubscribe") ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function createSignedNotificationToken(input: {
  attendeeId: string;
  eventId: string;
  faceId: string;
  action: TokenAction;
}) {
  const payload: TokenPayload = {
    sub: input.attendeeId,
    eventId: input.eventId,
    faceId: input.faceId,
    action: input.action,
    exp: Math.floor(Date.now() / 1000) + getTokenTtlSeconds(),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = signValue(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function verifySignedNotificationToken(
  token: string,
  expectedAction: TokenAction,
) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const payload = decodePayload(encodedPayload);
  if (!payload || payload.action !== expectedAction) {
    return null;
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
