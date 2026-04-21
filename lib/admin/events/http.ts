import "server-only";

import { headers } from "next/headers";

import type {
  AdminEventSummary,
  AdminEventPhotosPage,
} from "@/lib/admin/events/contracts";
import type { AdminEventPhotosView } from "@/lib/admin/events/backend";

type AdminEventsPageResponse = {
  events: AdminEventSummary[];
  totalCount: number;
};

function getRequestBaseUrl(headerStore: Headers) {
  const forwardedProto = headerStore.get("x-forwarded-proto") || "http";
  const forwardedHost = headerStore.get("x-forwarded-host") || headerStore.get("host");

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return process.env.FACE_LOCATOR_PUBLIC_BASE_URL || "http://localhost:3000";
}

function shouldForwardHeader(name: string) {
  return !["connection", "content-length", "host", "accept-encoding"].includes(name.toLowerCase());
}

function buildForwardHeaders(source: Headers, initHeaders?: HeadersInit) {
  const forwarded = new Headers(initHeaders);

  for (const [name, value] of source.entries()) {
    if (shouldForwardHeader(name) && !forwarded.has(name)) {
      forwarded.set(name, value);
    }
  }

  if (!forwarded.has("accept")) {
    forwarded.set("accept", "application/json");
  }

  return forwarded;
}

async function fetchAdminRoute(path: string, init?: RequestInit) {
  const headerStore = await headers();
  const baseUrl = getRequestBaseUrl(headerStore);
  const url = new URL(path, baseUrl);

  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: buildForwardHeaders(headerStore, init?.headers),
  });
}

async function readJson<T>(response: Response) {
  const text = await response.text();
  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

async function throwIfNotOk(response: Response, fallbackMessage: string) {
  if (response.ok) {
    return;
  }

  const body = await response.text();
  const message = body || fallbackMessage;
  throw new Error(`${message} (status ${response.status})`);
}

export async function loadAdminEventsPage(input: {
  page: number;
  pageSize: number;
}): Promise<AdminEventsPageResponse> {
  const searchParams = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });

  const response = await fetchAdminRoute(`/api/admin/events?${searchParams.toString()}`);
  await throwIfNotOk(response, "Failed to load admin events");

  return readJson<AdminEventsPageResponse>(response);
}

export async function loadAdminEventPhotosPage(input: {
  eventSlug: string;
  page: number;
  pageSize: number;
}): Promise<AdminEventPhotosView | null> {
  const searchParams = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });

  const response = await fetchAdminRoute(
    `/api/admin/events/${encodeURIComponent(input.eventSlug)}/photos?${searchParams.toString()}`,
  );

  if (response.status === 404) {
    return null;
  }

  await throwIfNotOk(response, "Failed to load admin event photos");

  return readJson<AdminEventPhotosPage & { event: AdminEventSummary }>(response);
}
