"use client";

import React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { isUnauthorizedAdminStatus, redirectToAdminAuth } from "@/lib/admin/client";
import type { AdminEventPhoto } from "@/lib/admin/events/contracts";

type Props = {
  eventSlug: string;
  initialPhotos: AdminEventPhoto[];
};

type BatchResult = {
  photoId: string;
  status: "deleted" | "not_found" | "failed";
  message?: string;
};

export function PhotosManager({ eventSlug, initialPhotos }: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initialPhotos);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const toggleSelected = (photoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const deleteOne = async (photoId: string) => {
    const ok = window.confirm(`Delete photo ${photoId}? This permanently removes it from S3.`);
    if (!ok) {
      return;
    }

    setBusyPhotoId(photoId);
    setStatusMessage(null);

    const response = await fetch(`/api/admin/events/${eventSlug}/photos/${photoId}`, {
      method: "DELETE",
    });

    if (isUnauthorizedAdminStatus(response.status)) {
      redirectToAdminAuth();
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.status === "failed") {
      setStatusMessage(payload?.message || "Failed to delete photo");
      setBusyPhotoId(null);
      return;
    }

    setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(photoId);
      return next;
    });
    setStatusMessage(`Photo ${photoId} deleted.`);
    setBusyPhotoId(null);
    router.refresh();
  };

  const deleteBatch = async () => {
    if (selectedIds.length === 0) {
      return;
    }

    const ok = window.confirm(
      `Delete ${selectedIds.length} photo(s)? This permanently removes them from S3.`,
    );
    if (!ok) {
      return;
    }

    setIsBatchDeleting(true);
    setStatusMessage(null);
    const idempotencyKey = crypto.randomUUID();

    const response = await fetch(`/api/admin/events/${eventSlug}/photos/delete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ photoIds: selectedIds }),
    });

    if (isUnauthorizedAdminStatus(response.status)) {
      setIsBatchDeleting(false);
      redirectToAdminAuth();
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) {
      setStatusMessage("Batch delete failed.");
      setIsBatchDeleting(false);
      return;
    }

    const results = (payload.results || []) as BatchResult[];
    const deletedIds = results.filter((item) => item.status === "deleted").map((item) => item.photoId);
    const failedItems = results.filter((item) => item.status === "failed");

    setPhotos((prev) => prev.filter((photo) => !deletedIds.includes(photo.id)));
    setSelected(new Set());

    if (failedItems.length > 0) {
      setStatusMessage(
        `Deleted ${deletedIds.length}. Failed ${failedItems.length}: ${failedItems
          .map((item) => item.photoId)
          .join(", ")}`,
      );
    } else {
      setStatusMessage(`Deleted ${deletedIds.length} photo(s).`);
    }

    setIsBatchDeleting(false);
    router.refresh();
  };

  if (photos.length === 0) {
    return (
      <section style={{ border: "1px dashed var(--border)", borderRadius: "1rem", padding: "1rem" }}>
        <p>No photos are currently indexed for this event.</p>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={selectedIds.length === 0 || isBatchDeleting || busyPhotoId !== null}
          onClick={deleteBatch}
          style={{
            border: "none",
            borderRadius: "999px",
            padding: "0.65rem 1rem",
            background: "var(--danger)",
            color: "white",
            fontWeight: 700,
            cursor: selectedIds.length === 0 ? "not-allowed" : "pointer",
            opacity: selectedIds.length === 0 ? 0.5 : 1,
          }}
        >
          {isBatchDeleting ? "Deleting..." : `Delete selected (${selectedIds.length})`}
        </button>

        <button
          type="button"
          onClick={() => {
            if (selected.size === photos.length) {
              setSelected(new Set());
            } else {
              setSelected(new Set(photos.map((photo) => photo.id)));
            }
          }}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "999px",
            padding: "0.65rem 1rem",
            background: "var(--surface-strong)",
            cursor: "pointer",
          }}
        >
          {selected.size === photos.length ? "Clear selection" : "Select all on page"}
        </button>
      </div>

      {statusMessage ? (
        <p aria-live="polite" style={{ color: "var(--accent-strong)", fontWeight: 700 }}>
          {statusMessage}
        </p>
      ) : null}

      <ul
        style={{
          listStyle: "none",
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {photos.map((photo) => (
          <li
            key={photo.id}
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-strong)",
              borderRadius: "1rem",
              overflow: "hidden",
            }}
          >
            {photo.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.previewUrl}
                alt=""
                style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", aspectRatio: "4 / 3", background: "rgba(0,0,0,0.08)" }} />
            )}

            <div style={{ padding: "0.8rem", display: "grid", gap: "0.6rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="checkbox"
                  checked={selected.has(photo.id)}
                  onChange={() => toggleSelected(photo.id)}
                  disabled={isBatchDeleting || busyPhotoId !== null}
                  aria-label={`Select photo ${photo.id}`}
                />
                <span style={{ fontSize: "0.88rem" }}>{photo.id}</span>
              </label>

              <button
                type="button"
                onClick={() => void deleteOne(photo.id)}
                disabled={isBatchDeleting || busyPhotoId === photo.id}
                style={{
                  border: "none",
                  borderRadius: "0.7rem",
                  padding: "0.5rem 0.65rem",
                  background: "var(--danger)",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                {busyPhotoId === photo.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
