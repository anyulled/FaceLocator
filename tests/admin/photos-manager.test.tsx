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

const sampleFaceMatchSummary = {
  totalMatchedFaces: 1,
  totalRegisteredSelfies: 4,
  totalAssociatedUsers: 5,
  matchedFaces: [
    {
      attendeeId: "attendee-1",
      attendeeName: "Test User",
      attendeeEmail: "test@example.com",
      faceEnrollmentId: "enrollment-1",
      faceId: "face-1",
      matchedPhotoCount: 3,
      lastMatchedAt: "2027-04-01T09:00:00.000Z",
    },
  ],
};

function renderManager() {
  render(
    <PhotosManager
      eventSlug="devbcn-2027"
      initialPhotos={[samplePhoto]}
      initialFaceMatchSummary={sampleFaceMatchSummary}
    />,
  );
}

describe("photos manager", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    redirectToAdminAuthMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders event-level matched faces summary below action buttons", () => {
    renderManager();

    expect(screen.getByText("Matched faces in this event: 1")).toBeTruthy();
    expect(screen.getByText("Selfies registered: 4")).toBeTruthy();
    expect(screen.getByText("Users associated with event: 5")).toBeTruthy();
    const item = screen.getByText(/Test User/).closest("li");
    expect(item?.textContent).toContain("Test User (test@example.com): 3 photos matched");
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

    renderManager();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(redirectToAdminAuthMock).toHaveBeenCalledTimes(1);
    });
  });

  it("sends an individual email link for a matched attendee", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          scanned: 1,
          sent: 1,
          skipped: 0,
          failed: 0,
          message: "Notification email sent",
        }),
      }),
    );

    renderManager();

    await user.click(screen.getByRole("button", { name: "Send email link" }));

    expect(fetch).toHaveBeenCalledWith("/api/admin/events/devbcn-2027/photos/notify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ attendeeId: "attendee-1" }),
    });

    await waitFor(() => {
      expect(screen.getByText("Email link sent to Test User.")).toBeTruthy();
    });
  });

  it("redirects to admin auth when manual email send is unauthorized", async () => {
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

    renderManager();
    await user.click(screen.getByRole("button", { name: "Send email link" }));

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

    renderManager();

    await user.click(screen.getByLabelText("Select photo photo-1"));
    await user.click(screen.getByRole("button", { name: "Delete selected (1)" }));

    await waitFor(() => {
      expect(redirectToAdminAuthMock).toHaveBeenCalledTimes(1);
    });
  });

  it("reprocesses all uploaded photos and shows summary counts", async () => {
    const user = userEvent.setup();
    let releaseFetch!: () => void;
    const fetchResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        summary: {
          total: 120,
          queued: 120,
          succeeded: 117,
          failed: 3,
        },
      }),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            releaseFetch = () => resolve(fetchResponse);
          }),
      ),
    );

    renderManager();

    await user.click(screen.getByRole("button", { name: "Reprocess all uploaded photos" }));

    expect(screen.getByText("Reprocessing all uploaded photos for this event...")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/admin/events/devbcn-2027/photos/reprocess", {
      method: "POST",
    });

    releaseFetch();

    await waitFor(() => {
      expect(
        screen.getByText("Reprocess request submitted. Summary: total 120, queued 120, succeeded 117, failed 3."),
      ).toBeTruthy();
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("redirects to admin auth when reprocess is unauthorized", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized" }),
      }),
    );

    renderManager();

    await user.click(screen.getByRole("button", { name: "Reprocess all uploaded photos" }));

    await waitFor(() => {
      expect(redirectToAdminAuthMock).toHaveBeenCalledTimes(1);
    });
  });

  it("shows failure status and summary counts when reprocess request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: "Lambda invoke failed",
          summary: {
            total: 87,
            queued: 40,
            failed: 47,
          },
        }),
      }),
    );

    renderManager();

    await user.click(screen.getByRole("button", { name: "Reprocess all uploaded photos" }));

    await waitFor(() => {
      expect(
        screen.getByText("Reprocess failed: Lambda invoke failed. Summary: total 87, queued 40, failed 47."),
      ).toBeTruthy();
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
