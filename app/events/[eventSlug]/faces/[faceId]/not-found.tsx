import React from "react";
import Link from "next/link";

export default function MatchedGalleryNotFound() {
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
          width: "min(38rem, 100%)",
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
          Link unavailable
        </p>
        <h1 style={{ marginTop: "0.85rem", fontSize: "clamp(2rem, 4vw, 3rem)" }}>
          This photo link is not available.
        </h1>
        <p style={{ color: "#5e5147", lineHeight: 1.7 }}>
          The link may be expired, incomplete, or already invalidated. If you were expecting matched
          photos, ask the organizer to resend the latest gallery link.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
          <Link
            href="/"
            style={{
              borderRadius: "999px",
              padding: "0.9rem 1.25rem",
              border: "none",
              background: "#bf4f35",
              color: "#fff",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Go home
          </Link>
        </div>
      </section>
    </main>
  );
}
