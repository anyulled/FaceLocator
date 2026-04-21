import Link from "next/link";

import { CreateEventForm } from "@/components/admin/events/create-event-form";

export default function NewAdminEventPage() {
  return (
    <main style={{ minHeight: "100vh", padding: "1.4rem" }}>
      <div style={{ maxWidth: "76rem", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <Link href="/admin/events" style={{ color: "var(--accent-strong)", fontWeight: 700 }}>
          ← Back to events
        </Link>
        <CreateEventForm />
      </div>
    </main>
  );
}
