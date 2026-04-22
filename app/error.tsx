"use client";

import Link from "next/link";

type AppErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AppError({ error, reset }: AppErrorProps) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "linear-gradient(160deg, #fff7ef 0%, #fff 55%, #f6efe8 100%)",
      }}
    >
      <section
        style={{
          width: "min(36rem, 100%)",
          padding: "2rem",
          borderRadius: "1.5rem",
          background: "rgba(255,255,255,0.96)",
          border: "1px solid rgba(191, 79, 53, 0.16)",
          boxShadow: "0 24px 80px rgba(42, 21, 10, 0.08)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#bf4f35",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontSize: "0.78rem",
          }}
        >
          Application error
        </p>
        <h1 style={{ marginTop: "0.85rem", fontSize: "clamp(2rem, 4vw, 3rem)" }}>
          We could not load this page.
        </h1>
        <p style={{ color: "#5e5147", lineHeight: 1.7 }}>
          The request reached the server, but rendering failed before the page could be shown.
          Try again in a moment. If the problem persists, check the server logs for this digest.
        </p>
        {error.digest ? (
          <p style={{ color: "#7a695d", fontFamily: "monospace", fontSize: "0.92rem" }}>
            Error digest: {error.digest}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
          <button
            type="button"
            onClick={reset}
            style={{
              border: "none",
              borderRadius: "999px",
              padding: "0.9rem 1.25rem",
              background: "#bf4f35",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <Link
            href="/"
            style={{
              borderRadius: "999px",
              padding: "0.9rem 1.25rem",
              border: "1px solid rgba(191, 79, 53, 0.2)",
              color: "#6f3225",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Go home
          </Link>
        </div>
      </section>
    </main>
  );
}
