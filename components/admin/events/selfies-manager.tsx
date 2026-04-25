"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { isUnauthorizedAdminStatus, redirectToAdminAuth } from "@/lib/admin/client";
import type { AdminEventSelfie } from "@/lib/admin/events/contracts";

type Props = {
  eventSlug: string;
  initialSelfies: AdminEventSelfie[];
};

export function SelfiesManager({ eventSlug, initialSelfies }: Props) {
  const router = useRouter();
  const [selfies, setSelfies] = useState(initialSelfies);
  const [busyRegistrationId, setBusyRegistrationId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const deleteOne = async (registrationId: string) => {
    const ok = window.confirm(`Delete selfie registration ${registrationId}? This permanently removes it from S3 and removes the attendee from the event.`);
    if (!ok) {
      return;
    }

    setBusyRegistrationId(registrationId);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/admin/events/${eventSlug}/selfies/${registrationId}`, {
        method: "DELETE",
      });

      if (isUnauthorizedAdminStatus(response.status)) {
        redirectToAdminAuth();
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.status === "failed") {
        setStatusMessage(payload?.message || "Failed to delete selfie");
        return;
      }

      setSelfies((prev) => prev.filter((selfie) => selfie.registrationId !== registrationId));
      setStatusMessage(`Selfie registration ${registrationId} deleted.`);
      router.refresh();
    } catch (error) {
      console.error("Delete failed", error);
      setStatusMessage("A network error occurred while deleting the selfie.");
    } finally {
      setBusyRegistrationId(null);
    }
  };

  if (selfies.length === 0) {
    return (
      <section style={{ border: "1px dashed var(--border)", borderRadius: "1rem", padding: "1rem" }}>
        <p>No attendees or selfies are currently registered for this event.</p>
      </section>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
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
        {selfies.map((selfie) => (
          <li
            key={selfie.attendeeId}
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-strong)",
              borderRadius: "1rem",
              overflow: "hidden",
            }}
          >
            {selfie.previewUrl ? (
              <Image
                src={selfie.previewUrl}
                alt={selfie.name ? `Selfie of ${selfie.name}` : "Attendee selfie"}
                width={800}
                height={600}
                sizes="(max-width: 768px) 100vw, 220px"
                style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block" }}
              />
            ) : (
              <div style={{ width: "100%", aspectRatio: "4 / 3", background: "rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>No selfie</span>
              </div>
            )}

            <div style={{ padding: "0.8rem", display: "grid", gap: "0.6rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>{selfie.name || "Unknown"}</span>
                <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{selfie.email || "No email"}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Status: {selfie.status || "None"}</span>
              </div>

              {selfie.registrationId ? (
                <button
                  type="button"
                  onClick={() => void deleteOne(selfie.registrationId!)}
                  disabled={busyRegistrationId === selfie.registrationId}
                  style={{
                    border: "none",
                    borderRadius: "0.7rem",
                    padding: "0.5rem 0.65rem",
                    background: "var(--danger)",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {busyRegistrationId === selfie.registrationId ? "Deleting..." : "Delete Selfie"}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
