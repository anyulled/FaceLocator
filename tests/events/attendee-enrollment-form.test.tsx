// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AttendeeEnrollmentForm } from "@/components/events/attendee-enrollment-form";

const createRegistrationIntentMock = vi.fn();
const uploadSelfieMock = vi.fn();
const completeRegistrationMock = vi.fn();
const getRegistrationStatusMock = vi.fn();

vi.mock("next/image", () => ({
  default: ({
    unoptimized: _unoptimized,
    alt,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void _unoptimized;

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={alt ?? ""} {...props} />
    );
  },
}));

vi.mock("@/lib/attendees/client", () => ({
  createRegistrationIntent: (...args: unknown[]) => createRegistrationIntentMock(...args),
  uploadSelfie: (...args: unknown[]) => uploadSelfieMock(...args),
  completeRegistration: (...args: unknown[]) => completeRegistrationMock(...args),
  getRegistrationStatus: (...args: unknown[]) => getRegistrationStatusMock(...args),
}));

describe("attendee enrollment form", () => {
  const createObjectURLMock = vi.fn(() => "blob:preview");
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    createRegistrationIntentMock.mockReset();
    uploadSelfieMock.mockReset();
    completeRegistrationMock.mockReset();
    getRegistrationStatusMock.mockReset();
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();

    vi.stubGlobal("URL", {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows inline validation errors before any network call", async () => {
    const user = userEvent.setup();

    render(
      <AttendeeEnrollmentForm
        eventSlug="speaker-session-2026"
        eventTitle="Speaker Session 2026"
      />,
    );

    await user.click(screen.getByRole("button", { name: /register my selfie/i }));

    expect((await screen.findAllByText("Please enter your full name.")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Email address is invalid.").length).toBeGreaterThan(0);
    expect(screen.getByText("Please select a selfie to upload.")).not.toBeNull();
    expect(screen.getByText("Consent is required.")).not.toBeNull();
    expect(createRegistrationIntentMock).not.toHaveBeenCalled();
  });

  it("updates the preview when a file is selected", async () => {
    const user = userEvent.setup();

    render(
      <AttendeeEnrollmentForm
        eventSlug="speaker-session-2026"
        eventTitle="Speaker Session 2026"
      />,
    );

    const file = new File(["binary"], "selfie.jpg", { type: "image/jpeg" });
    const fileInput = screen.getByLabelText(/selfie upload/i);

    await user.upload(fileInput, file);

    expect(createObjectURLMock).toHaveBeenCalledWith(file);
    expect(screen.getByAltText("Selected selfie preview").getAttribute("src")).toBe(
      "blob:preview",
    );
  });

  it("disables duplicate submission while work is in flight", async () => {
    const user = userEvent.setup();

    createRegistrationIntentMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              registrationId: "reg_123",
              attendeeId: "att_123",
              upload: {
                method: "PUT",
                url: "mock://upload/reg_123",
                headers: {
                  "Content-Type": "image/jpeg",
                },
                objectKey: "events/speaker-session-2026/attendees/att_123/selfie.jpg",
                expiresAt: new Date().toISOString(),
              },
              status: "UPLOAD_PENDING",
            });
          }, 50);
        }),
    );
    uploadSelfieMock.mockResolvedValue(undefined);
    completeRegistrationMock.mockResolvedValue({
      registrationId: "reg_123",
      status: "PROCESSING",
      message: "Your selfie is being processed now.",
    });
    getRegistrationStatusMock.mockResolvedValue({
      registrationId: "reg_123",
      status: "ENROLLED",
      message: "Your selfie has been registered.",
    });

    render(
      <AttendeeEnrollmentForm
        eventSlug="speaker-session-2026"
        eventTitle="Speaker Session 2026"
      />,
    );

    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/email address/i), "jane@example.com");
    await user.click(screen.getByLabelText(/i consent to facelocator/i));

    const file = new File(["binary"], "selfie.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/selfie upload/i), file);

    const submitButton = screen.getByRole("button", { name: /register my selfie/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        (screen.getByRole("button", {
          name: /processing enrollment/i,
        }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    await waitFor(() => {
      expect(createRegistrationIntentMock).toHaveBeenCalledTimes(1);
      expect(uploadSelfieMock).toHaveBeenCalledTimes(1);
      expect(completeRegistrationMock).toHaveBeenCalledTimes(1);
    });
  });

  it("renders API field errors inline when registration creation fails", async () => {
    const user = userEvent.setup();

    createRegistrationIntentMock.mockRejectedValue({
      error: {
        code: "INVALID_EMAIL",
        message: "Email address is invalid.",
        field: "email",
      },
    });

    render(
      <AttendeeEnrollmentForm
        eventSlug="speaker-session-2026"
        eventTitle="Speaker Session 2026"
      />,
    );

    await user.type(screen.getByLabelText(/full name/i), "Jane Doe");
    await user.type(screen.getByLabelText(/email address/i), "jane@example.com");
    await user.click(screen.getByLabelText(/i consent to facelocator/i));
    await user.upload(
      screen.getByLabelText(/selfie upload/i),
      new File(["binary"], "selfie.jpg", { type: "image/jpeg" }),
    );

    await user.click(screen.getByRole("button", { name: /register my selfie/i }));

    expect((await screen.findAllByText("Email address is invalid.")).length).toBeGreaterThan(0);
  });
});
