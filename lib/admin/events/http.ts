import "server-only";

import { randomUUID } from "node:crypto";

import { cookies, headers } from "next/headers";

export class AdminRouteError extends Error {
  public readonly status: number;

  public readonly body: unknown;

  public readonly requestPath: string;

  constructor(requestPath: string, status: number, body: unknown) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Admin request failed with status ${status}`;

    super(message);
    this.name = "AdminRouteError";
    this.status = status;
    this.body = body;
    this.requestPath = requestPath;
  }
}

function readEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

async function getBaseUrl() {
  const explicitBase = readEnv("FACE_LOCATOR_PUBLIC_BASE_URL", "NEXT_PUBLIC_FACE_LOCATOR_PUBLIC_BASE_URL");
  if (explicitBase) {
    return explicitBase.replace(/\/+$/, "");
  }

  const headerStore = await headers();
  const forwardedProto = headerStore.get("x-forwarded-proto") ?? "http";
  const forwardedHost = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return "http://localhost:3000";
}

async function getForwardedHeaders() {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const headerEntries: Array<[string, string]> = [];

  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  if (cookieHeader) {
    headerEntries.push(["cookie", cookieHeader]);
  }

  const authorization = headerStore.get("authorization");
  if (authorization) {
    headerEntries.push(["authorization", authorization]);
  }

  const requestId =
    headerStore.get("x-amz-cf-id") ??
    headerStore.get("x-amzn-requestid") ??
    headerStore.get("x-correlation-id") ??
    randomUUID();
  if (requestId) {
    headerEntries.push(["x-correlation-id", requestId]);
  }

  return new Headers(headerEntries);
}

async function fetchAdminRouteJson<T>(requestPath: string, init?: RequestInit): Promise<T> {
  const url = new URL(requestPath, await getBaseUrl());
  const forwardedHeaders = await getForwardedHeaders();
  const response = await fetch(url, {
    ...init,
    headers: forwardedHeaders,
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new AdminRouteError(requestPath, response.status, body);
  }

  return body as T;
}

export async function loadAdminEventsPage(input: { page: number; pageSize: number }) {
  const searchParams = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });

  return fetchAdminRouteJson<{
    events: Array<{
      id: string;
      slug: string;
      title: string;
      venue: string;
      description: string;
      startsAt: string;
      endsAt: string;
      photoCount: number;
    }>;
    totalCount: number;
  }>(`/api/admin/events?${searchParams.toString()}`);
}

export async function loadAdminEventPhotosPage(input: {
  eventSlug: string;
  page: number;
  pageSize: number;
}) {
  const searchParams = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });

  return fetchAdminRouteJson<{
    event: {
      id: string;
      slug: string;
      title: string;
      venue: string;
      description: string;
      startsAt: string;
      endsAt: string;
    } | null;
    photos: Array<{
      id: string;
      eventId: string;
      eventSlug: string;
      objectKey: string;
      status: string;
      uploadedAt: string;
      previewUrl: string | null;
    }>;
    faceMatchSummary: {
      totalMatchedFaces: number;
      matchedFaces: Array<{
        attendeeId: string;
        attendeeName: string;
        attendeeEmail: string;
        faceEnrollmentId: string;
        faceId: string;
        matchedPhotoCount: number;
        lastMatchedAt: string;
      }>;
    };
    page: number;
    pageSize: number;
    totalCount: number;
  }>(`/api/admin/events/${encodeURIComponent(input.eventSlug)}/photos?${searchParams.toString()}`);
}
