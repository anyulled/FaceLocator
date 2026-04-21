"use client";

export function isUnauthorizedAdminStatus(status: number) {
  return status === 401 || status === 403;
}

export function redirectToAdminAuth() {
  const redirect = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/api/admin/login?redirect=${encodeURIComponent(redirect)}`);
}
