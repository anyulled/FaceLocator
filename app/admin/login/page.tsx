import { redirect } from "next/navigation";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectPath = params.redirect && params.redirect.startsWith("/")
    ? params.redirect
    : "/admin/events";

  redirect(`/api/admin/login?redirect=${encodeURIComponent(redirectPath)}`);
}
