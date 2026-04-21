import { AdminLoginForm } from "@/components/admin/events/admin-login-form";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect && params.redirect.startsWith("/")
    ? params.redirect
    : "/admin/events";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
      }}
    >
      <AdminLoginForm redirectTo={redirectTo} />
    </main>
  );
}
