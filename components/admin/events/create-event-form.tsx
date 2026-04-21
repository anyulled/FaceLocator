"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  title: string;
  slug: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  description: string;
};

const initialFormState: FormState = {
  title: "",
  slug: "",
  venue: "",
  startsAt: "",
  endsAt: "",
  description: "",
};

export function CreateEventForm() {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isInvalidDateRange = useMemo(() => {
    if (!state.startsAt || !state.endsAt) {
      return false;
    }

    const start = new Date(state.startsAt);
    const end = new Date(state.endsAt);

    return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end <= start;
  }, [state.endsAt, state.startsAt]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isInvalidDateRange) {
      setError("End date must be after start date.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/admin/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ...state,
        startsAt: new Date(state.startsAt).toISOString(),
        endsAt: new Date(state.endsAt).toISOString(),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Failed to create event" }));
      setError(payload.error || "Failed to create event");
      setIsSubmitting(false);
      return;
    }

    const created = await response.json();
    router.push(`/admin/events/${created.slug}/photos`);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem", maxWidth: "48rem" }}>
      <h1 style={{ fontSize: "2rem" }}>Create event</h1>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontWeight: 700 }}>
          {error}
        </p>
      ) : null}

      <label style={{ display: "grid", gap: "0.4rem" }}>
        <span>Event title</span>
        <input
          required
          value={state.title}
          onChange={(event) => setState((prev) => ({ ...prev, title: event.target.value }))}
          style={inputStyle}
        />
      </label>

      <label style={{ display: "grid", gap: "0.4rem" }}>
        <span>Slug</span>
        <input
          required
          value={state.slug}
          onChange={(event) => setState((prev) => ({ ...prev, slug: event.target.value }))}
          style={inputStyle}
          placeholder="devbcn-2026"
        />
      </label>

      <label style={{ display: "grid", gap: "0.4rem" }}>
        <span>Venue</span>
        <input
          required
          value={state.venue}
          onChange={(event) => setState((prev) => ({ ...prev, venue: event.target.value }))}
          style={inputStyle}
        />
      </label>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <label style={{ display: "grid", gap: "0.4rem" }}>
          <span>Starts at</span>
          <input
            required
            type="datetime-local"
            value={state.startsAt}
            onChange={(event) => setState((prev) => ({ ...prev, startsAt: event.target.value }))}
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: "0.4rem" }}>
          <span>Ends at</span>
          <input
            required
            type="datetime-local"
            value={state.endsAt}
            onChange={(event) => setState((prev) => ({ ...prev, endsAt: event.target.value }))}
            style={inputStyle}
          />
        </label>
      </div>

      <label style={{ display: "grid", gap: "0.4rem" }}>
        <span>Description</span>
        <textarea
          required
          value={state.description}
          onChange={(event) => setState((prev) => ({ ...prev, description: event.target.value }))}
          style={{ ...inputStyle, minHeight: "8rem", resize: "vertical" }}
        />
      </label>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            border: "none",
            borderRadius: "999px",
            padding: "0.8rem 1.2rem",
            background: "var(--accent)",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          {isSubmitting ? "Creating..." : "Create event"}
        </button>
      </div>
    </form>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "0.8rem",
  border: "1px solid var(--border)",
  background: "var(--surface-strong)",
  padding: "0.75rem 0.85rem",
  font: "inherit",
};
