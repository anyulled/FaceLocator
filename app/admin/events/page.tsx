import Link from "next/link";
import type { CSSProperties } from "react";
import { headers } from "next/headers";

import { listAdminEvents } from "@/lib/admin/events/repository";
import { requireAdminPageAccess } from "@/lib/admin/page-auth";

type SearchParams = Promise<{ page?: string; pageSize?: string }>;

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize || "20") || 20));

  await requireAdminPageAccess("/admin/events");

  let events: Awaited<ReturnType<typeof listAdminEvents>>["events"] = [];
  let totalCount = 0;
  let loadError = false;
  const headerStore = await headers();
  const requestId = headerStore.get("x-amz-cf-id") ?? headerStore.get("x-amzn-requestid") ?? undefined;

  try {
    const result = await listAdminEvents({ page, pageSize });
    events = result.events;
    totalCount = result.totalCount;
  } catch (error) {
    loadError = true;
    console.error(
      JSON.stringify({
        scope: "admin-events-page",
        level: "error",
        message: "Failed to load admin events listing",
        requestPath: "/admin/events",
        requestId: requestId ?? null,
        page,
        pageSize,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
  }

  const hasPrevious = page > 1;
  const hasNext = page * pageSize < totalCount;

  return (
    <main style={{ minHeight: "100vh", padding: "1.4rem" }}>
      <div style={{ maxWidth: "76rem", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: "2rem" }}>Admin events</h1>
            <p style={{ color: "var(--muted)", marginTop: "0.35rem" }}>
              Manage events and event photos.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
            <Link
              href="/admin/events/new"
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "0.6rem 1rem",
                background: "var(--accent)",
                color: "white",
                fontWeight: 700,
              }}
            >
              Create event
            </Link>
            <Link
              href="/api/admin/logout"
              style={{
                border: "1px solid var(--border)",
                borderRadius: "999px",
                padding: "0.6rem 1rem",
                background: "var(--surface-strong)",
                fontWeight: 700,
              }}
            >
              Logout
            </Link>
          </div>
        </header>

        {loadError ? (
          <section
            style={{
              border: "1px solid #f3b3ad",
              borderRadius: "1rem",
              background: "#fff4f2",
              color: "#7a1f15",
              padding: "1rem",
            }}
          >
            <p style={{ fontWeight: 700 }}>Unable to load events right now.</p>
            <p style={{ marginTop: "0.4rem" }}>
              Please retry in a few seconds. If this persists, check server logs with request id{" "}
              <code>{requestId ?? "n/a"}</code>.
            </p>
          </section>
        ) : (
          <section
            style={{
              border: "1px solid var(--border)",
              borderRadius: "1rem",
              background: "var(--surface-strong)",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", background: "rgba(0,0,0,0.04)" }}>
                  <th style={thStyle}>Event</th>
                  <th style={thStyle}>Slug</th>
                  <th style={thStyle}>Venue</th>
                  <th style={thStyle}>Starts</th>
                  <th style={thStyle}>Ends</th>
                  <th style={thStyle}>Photos</th>
                  <th style={thStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "1rem", color: "var(--muted)" }}>
                      No events found.
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={tdStyle}>{event.title}</td>
                      <td style={tdStyle}>{event.slug}</td>
                      <td style={tdStyle}>{event.venue}</td>
                      <td style={tdStyle}>{formatIso(event.startsAt)}</td>
                      <td style={tdStyle}>{formatIso(event.endsAt)}</td>
                      <td style={tdStyle}>{event.photoCount}</td>
                      <td style={tdStyle}>
                        <Link
                          href={`/admin/events/${event.slug}/photos`}
                          style={{ color: "var(--accent-strong)", fontWeight: 700 }}
                        >
                          Open photos
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        )}

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--muted)" }}>
            Page {page} · Total events {totalCount}
          </p>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link
              aria-disabled={!hasPrevious}
              href={hasPrevious ? `/admin/events?page=${page - 1}&pageSize=${pageSize}` : "#"}
              style={{
                opacity: hasPrevious ? 1 : 0.5,
                pointerEvents: hasPrevious ? "auto" : "none",
              }}
            >
              Previous
            </Link>
            <Link
              aria-disabled={!hasNext}
              href={hasNext ? `/admin/events?page=${page + 1}&pageSize=${pageSize}` : "#"}
              style={{
                opacity: hasNext ? 1 : 0.5,
                pointerEvents: hasNext ? "auto" : "none",
              }}
            >
              Next
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function formatIso(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const thStyle: CSSProperties = {
  padding: "0.8rem",
  fontSize: "0.85rem",
};

const tdStyle: CSSProperties = {
  padding: "0.8rem",
  verticalAlign: "top",
};
