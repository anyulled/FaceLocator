import Link from "next/link";
import { notFound } from "next/navigation";

import { PhotosManager } from "@/components/admin/events/photos-manager";
import { getAdminEventHeader, listAdminEventPhotos } from "@/lib/admin/events/repository";

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

  const [event, photosPage] = await Promise.all([
    getAdminEventHeader(eventSlug),
    listAdminEventPhotos({ eventSlug, page, pageSize }),
  ]);

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
