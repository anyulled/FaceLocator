import Link from "next/link";
import { notFound } from "next/navigation";

import { PhotosManager } from "@/components/admin/events/photos-manager";
import { AdminRouteError, loadAdminEventPhotosPage } from "@/lib/admin/events/http";
import { requireAdminPageAccess } from "@/lib/admin/page-auth";

type SearchParams = Promise<{ page?: string; pageSize?: string }>;

export default async function AdminEventPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventSlug: string }>;
  searchParams: SearchParams;
}) {
  const { eventSlug } = await params;
  const query = await searchParams;
  const page = Math.max(1, Number(query.page || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || "30") || 30));
  const routePath = `/admin/events/${eventSlug}/photos`;
  await requireAdminPageAccess(routePath);

  let event: Awaited<ReturnType<typeof loadAdminEventPhotosPage>>["event"] = null;
  let photosPage: Awaited<ReturnType<typeof loadAdminEventPhotosPage>> = {
    event: null,
    photos: [],
    page,
    pageSize,
    totalCount: 0,
  };
  let loadError = false;
  let loadErrorMessage = "Please retry in a few seconds.";
  let requestId: string | undefined;

  try {
    photosPage = await loadAdminEventPhotosPage({ eventSlug, page, pageSize });
    event = photosPage.event;
  } catch (error) {
    if (error instanceof AdminRouteError && error.status === 404) {
      notFound();
    }
    loadError = true;
    loadErrorMessage = error instanceof AdminRouteError
      ? error.message
      : error instanceof Error
        ? error.message
        : "An unexpected error occurred while loading event photos.";
    requestId =
      error instanceof AdminRouteError &&
      typeof error.body === "object" &&
      error.body !== null &&
      "requestId" in error.body
        ? String((error.body as { requestId?: unknown }).requestId ?? "n/a")
        : undefined;
    console.error(
      JSON.stringify({
        scope: "admin-event-photos-page",
        level: "error",
        message: "Failed to load admin event photos page",
        requestPath: routePath,
        requestId: requestId ?? null,
        page,
        pageSize,
        eventSlug,
        route: error instanceof AdminRouteError
          ? {
              status: error.status,
              body: error.body,
            }
          : null,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }),
    );
  }

  if (!loadError && !event) {
    notFound();
  }

  if (loadError) {
    return (
      <main style={{ minHeight: "100vh", padding: "1.4rem" }}>
        <div style={{ maxWidth: "76rem", margin: "0 auto", display: "grid", gap: "1rem" }}>
          <header style={{ display: "grid", gap: "0.5rem" }}>
            <Link href="/admin/events" style={{ color: "var(--accent-strong)", fontWeight: 700 }}>
              ← Back to events
            </Link>
            <h1 style={{ fontSize: "2rem" }}>Event photos</h1>
          </header>
          <section
            style={{
              border: "1px solid #f3b3ad",
              borderRadius: "1rem",
              background: "#fff4f2",
              color: "#7a1f15",
              padding: "1rem",
            }}
          >
            <p style={{ fontWeight: 700 }}>Unable to load photos right now.</p>
            <p style={{ marginTop: "0.4rem" }}>
              {loadErrorMessage} If this persists, check server logs with request id{" "}
              <code>{requestId ?? "n/a"}</code>.
            </p>
          </section>
        </div>
      </main>
    );
  }

  if (!event) {
    notFound();
  }

  const hasPrevious = page > 1;
  const hasNext = page * pageSize < photosPage.totalCount;

  return (
    <main style={{ minHeight: "100vh", padding: "1.4rem" }}>
      <div style={{ maxWidth: "76rem", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <header style={{ display: "grid", gap: "0.5rem" }}>
          <Link href="/admin/events" style={{ color: "var(--accent-strong)", fontWeight: 700 }}>
            ← Back to events
          </Link>

          <h1 style={{ fontSize: "2rem" }}>{event.title}</h1>
          <p style={{ color: "var(--muted)" }}>
            {event.slug} · {event.venue} · {photosPage.totalCount} photo(s)
          </p>
        </header>

        <PhotosManager eventSlug={eventSlug} initialPhotos={photosPage.photos} />

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ color: "var(--muted)" }}>
            Page {page}
          </p>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link
              aria-disabled={!hasPrevious}
              href={hasPrevious ? `/admin/events/${eventSlug}/photos?page=${page - 1}&pageSize=${pageSize}` : "#"}
              style={{
                opacity: hasPrevious ? 1 : 0.5,
                pointerEvents: hasPrevious ? "auto" : "none",
              }}
            >
              Previous
            </Link>
            <Link
              aria-disabled={!hasNext}
              href={hasNext ? `/admin/events/${eventSlug}/photos?page=${page + 1}&pageSize=${pageSize}` : "#"}
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
