"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

type Props = {
  redirectTo: string;
};

export function AdminLoginForm({ redirectTo }: Props) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ token, redirectTo }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Login failed" }));
      setError(payload.error || "Login failed");
      setIsSubmitting(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{
        width: "100%",
        maxWidth: "26rem",
        border: "1px solid var(--border)",
        borderRadius: "1rem",
        background: "var(--surface-strong)",
        padding: "1.4rem",
        display: "grid",
        gap: "0.8rem",
      }}
    >
      <h1 style={{ fontSize: "1.5rem" }}>Admin login</h1>
      <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>
        Enter the admin token to access event and photo operations.
      </p>

      {error ? (
        <p role="alert" style={{ color: "var(--danger)", fontWeight: 700 }}>
          {error}
        </p>
      ) : null}

      <label style={{ display: "grid", gap: "0.4rem" }}>
        <span>Admin token</span>
        <input
          autoFocus
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "0.75rem",
            padding: "0.7rem 0.85rem",
            background: "white",
            font: "inherit",
          }}
        />
      </label>

      <button
        disabled={isSubmitting}
        type="submit"
        style={{
          marginTop: "0.3rem",
          border: "none",
          borderRadius: "999px",
          padding: "0.75rem 1rem",
          background: "var(--accent)",
          color: "white",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
