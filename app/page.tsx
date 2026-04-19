import Link from "next/link";

export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
      }}
    >
      <section
        style={{
          maxWidth: "44rem",
          padding: "2.5rem",
          borderRadius: "1.75rem",
          background: "var(--surface-strong)",
          boxShadow: "var(--shadow)",
          border: "1px solid var(--border)",
        }}
      >
        <p
          style={{
            color: "var(--accent-strong)",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
            fontSize: "0.75rem",
          }}
        >
          Phase 0 Scaffold
        </p>
        <h1
          style={{
            marginTop: "1rem",
            fontSize: "clamp(2.25rem, 5vw, 3.5rem)",
            lineHeight: 1,
          }}
        >
          FaceLocator attendee enrollment
        </h1>
        <p
          style={{
            marginTop: "1rem",
            color: "var(--muted)",
            fontSize: "1.05rem",
            lineHeight: 1.7,
          }}
        >
          This repository now hosts the narrow Next.js enrollment slice for event
          photography registration, with mocked upload orchestration and server
          routes.
        </p>
        <Link
          href="/events/speaker-session-2026/register"
          style={{
            display: "inline-flex",
            marginTop: "1.5rem",
            padding: "0.9rem 1.25rem",
            borderRadius: "999px",
            background: "var(--accent)",
            color: "#fffaf5",
            fontWeight: 600,
          }}
        >
          Open sample registration flow
        </Link>
      </section>
    </main>
  );
}
