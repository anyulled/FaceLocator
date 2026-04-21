// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PhotosManager } from "@/components/admin/events/photos-manager";

const refreshMock = vi.fn();
const redirectToAdminAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock("@/lib/admin/client", () => ({
  isUnauthorizedAdminStatus: (status: number) => status === 401 || status === 403,
  redirectToAdminAuth: () => redirectToAdminAuthMock(),
}));

const samplePhoto = {
  id: "photo-1",
  eventId: "event-1",
  eventSlug: "devbcn-2027",
  objectKey: "events/devbcn-2027/photo-1.jpg",
  status: "ready",
  uploadedAt: "2027-04-01T08:00:00.000Z",
  previewUrl: null,
};

describe("photos manager", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    redirectToAdminAuthMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("redirects to admin auth when single delete is unauthorized", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      }),
    );

    render(<PhotosManager eventSlug="devbcn-2027" initialPhotos={[samplePhoto]} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(redirectToAdminAuthMock).toHaveBeenCalledTimes(1);
    });
  });

  it("redirects to admin auth when batch delete is unauthorized", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden" }),
      }),
    );

    render(<PhotosManager eventSlug="devbcn-2027" initialPhotos={[samplePhoto]} />);

    await user.click(screen.getByLabelText("Select photo photo-1"));
    await user.click(screen.getByRole("button", { name: "Delete selected (1)" }));

    await waitFor(() => {
      expect(redirectToAdminAuthMock).toHaveBeenCalledTimes(1);
    });
  });
});
