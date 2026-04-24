import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Admin sign in",
};

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
