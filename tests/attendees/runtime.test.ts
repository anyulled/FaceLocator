import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/attendees/repository", () => ({
  inMemoryAttendeeRepository: { kind: "memory" },
}));

vi.mock("@/lib/attendees/postgres-repository", () => ({
  postgresAttendeeRepository: { kind: "postgres" },
}));

const createUploadGatewayFromEnvMock = vi.fn(() => ({ kind: "upload-gateway" }));

vi.mock("@/lib/attendees/upload-gateway", () => ({
  createUploadGatewayFromEnv: createUploadGatewayFromEnvMock,
}));

describe("attendees runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FACE_LOCATOR_REPOSITORY_TYPE;
    createUploadGatewayFromEnvMock.mockClear();
  });

  it("defaults to the postgres repository when no repository type is configured", async () => {
    const { getAttendeeRepository } = await import("@/lib/attendees/runtime");

    expect(getAttendeeRepository()).toEqual({ kind: "postgres" });
  });

  it("keeps an explicit in-memory override for local scaffolding", async () => {
    process.env.FACE_LOCATOR_REPOSITORY_TYPE = "in-memory";

    const { getAttendeeRepository } = await import("@/lib/attendees/runtime");

    expect(getAttendeeRepository()).toEqual({ kind: "memory" });
  });

  it("builds upload instructions from the configured gateway", async () => {
    const { getUploadGateway } = await import("@/lib/attendees/runtime");

    expect(getUploadGateway()).toEqual({ kind: "upload-gateway" });
    expect(createUploadGatewayFromEnvMock).toHaveBeenCalledTimes(1);
  });
});
