import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notFoundMock = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
const formMock = vi.fn(
  ({ eventSlug, eventTitle }: { eventSlug: string; eventTitle: string }) => (
    <div data-testid="enrollment-form">
      {eventSlug}:{eventTitle}
    </div>
  ),
);

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/components/events/attendee-enrollment-form", () => ({
  AttendeeEnrollmentForm: formMock,
}));

describe("event registration page", () => {
  beforeEach(() => {
    notFoundMock.mockClear();
    formMock.mockClear();
  });

  it("renders the server page shell with event metadata and serializable form props", async () => {
    const { default: EventRegistrationPage } = await import(
      "@/app/events/[eventSlug]/register/page"
    );

    const element = await EventRegistrationPage({
      params: Promise.resolve({
        eventSlug: "speaker-session-2026",
      }),
    });
    const markup = renderToStaticMarkup(element);

    expect(markup).toContain("Event registration");
    expect(markup).toContain("Speaker Session 2026");
    expect(markup).toContain("Teatro del Prado, Madrid");
    expect(formMock).toHaveBeenCalledWith(
      {
        eventSlug: "speaker-session-2026",
        eventTitle: "Speaker Session 2026",
      },
      undefined,
    );
  });

  it("delegates missing events to notFound", async () => {
    const { default: EventRegistrationPage } = await import(
      "@/app/events/[eventSlug]/register/page"
    );

    await expect(
      EventRegistrationPage({
        params: Promise.resolve({
          eventSlug: "missing-event",
        }),
      }),
    ).rejects.toThrow("NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(formMock).not.toHaveBeenCalled();
  });
});
