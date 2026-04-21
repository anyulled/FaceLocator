"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  const handleClick = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <button
      onClick={handleClick}
      type="button"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "999px",
        padding: "0.5rem 0.9rem",
        background: "var(--surface-strong)",
        cursor: "pointer",
      }}
    >
      Logout
    </button>
  );
}
