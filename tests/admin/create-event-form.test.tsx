// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateEventForm } from "@/components/admin/events/create-event-form";

const pushMock = vi.fn();
const refreshMock = vi.fn();
const redirectToAdminAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

vi.mock("@/lib/admin/client", () => ({
  isUnauthorizedAdminStatus: (status: number) => status === 401 || status === 403,
  redirectToAdminAuth: () => redirectToAdminAuthMock(),
}));

describe("create event form", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    redirectToAdminAuthMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("redirects to admin auth when api returns unauthorized", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateEventForm />);

    await user.type(screen.getByLabelText("Event title"), "DevBcn 2027");
    await user.type(screen.getByLabelText("Slug"), "devbcn-2027");
    await user.type(screen.getByLabelText("Venue"), "Barcelona");
    await user.type(screen.getByLabelText("Starts at"), "2027-04-01T10:00");
    await user.type(screen.getByLabelText("Ends at"), "2027-04-01T12:00");
    await user.type(screen.getByLabelText("Description"), "Annual developer event");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => {
      expect(redirectToAdminAuthMock).toHaveBeenCalledTimes(1);
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("navigates to event photos on successful create", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ slug: "devbcn-2027" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CreateEventForm />);

    await user.type(screen.getByLabelText("Event title"), "DevBcn 2027");
    await user.type(screen.getByLabelText("Slug"), "devbcn-2027");
    await user.type(screen.getByLabelText("Venue"), "Barcelona");
    await user.type(screen.getByLabelText("Starts at"), "2027-04-01T10:00");
    await user.type(screen.getByLabelText("Ends at"), "2027-04-01T12:00");
    await user.type(screen.getByLabelText("Description"), "Annual developer event");
    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/admin/events/devbcn-2027/photos");
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });
});
