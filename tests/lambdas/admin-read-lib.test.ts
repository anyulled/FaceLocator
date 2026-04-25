import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@aws-sdk/client-secrets-manager", () => ({
  GetSecretValueCommand: class {
    public readonly input: unknown;
    constructor(input: unknown) { this.input = input; }
  },
  SecretsManagerClient: class {
    public readonly config: unknown;
    constructor(config: unknown) { this.config = config; }
    send = sendMock;
  },
}));

const adminReadLib = () => import("../../../lambdas/admin-read/lib.js") as Promise<{
  getRequiredEnv: (env: Record<string, string | undefined>) => {
    awsRegion: string;
    databaseSecretName: string;
    databaseSecretArn: string | null;
    eventPhotosBucketName: string;
    publicBaseUrl: string | null;
    logLevel: string;
  };
  getDatabaseConfig: (env: { awsRegion: string; databaseSecretName: string; databaseSecretArn: string | null }) => Promise<Record<string, unknown>>;
}>;

describe("lambdas/admin-read/lib — getRequiredEnv", () => {
  it("returns all required env values", async () => {
    const { getRequiredEnv } = await adminReadLib();
    const result = getRequiredEnv({
      AWS_REGION: "eu-west-1",
      DATABASE_SECRET_NAME: "my-secret",
      FACE_LOCATOR_EVENT_PHOTOS_BUCKET: "photos-bucket",
      DATABASE_SECRET_ARN: "arn:aws:secretsmanager:eu-west-1:123:secret:my-secret",
      FACE_LOCATOR_PUBLIC_BASE_URL: "https://example.com",
      LOG_LEVEL: "debug",
    });
    expect(result.awsRegion).toBe("eu-west-1");
    expect(result.databaseSecretName).toBe("my-secret");
    expect(result.databaseSecretArn).toBe("arn:aws:secretsmanager:eu-west-1:123:secret:my-secret");
    expect(result.eventPhotosBucketName).toBe("photos-bucket");
    expect(result.publicBaseUrl).toBe("https://example.com");
    expect(result.logLevel).toBe("debug");
  });

  it("defaults logLevel and publicBaseUrl", async () => {
    const { getRequiredEnv } = await adminReadLib();
    const result = getRequiredEnv({
      AWS_REGION: "us-east-1",
      DATABASE_SECRET_NAME: "sec",
      FACE_LOCATOR_EVENT_PHOTOS_BUCKET: "bucket",
    });
    expect(result.logLevel).toBe("info");
    expect(result.publicBaseUrl).toBeNull();
    expect(result.databaseSecretArn).toBeNull();
  });

  it("throws when required env vars are missing", async () => {
    const { getRequiredEnv } = await adminReadLib();
    expect(() => getRequiredEnv({})).toThrow("Missing required environment variables");
  });

  it("throws listing all missing keys", async () => {
    const { getRequiredEnv } = await adminReadLib();
    expect(() => getRequiredEnv({ AWS_REGION: "eu-west-1" })).toThrow("DATABASE_SECRET_NAME");
  });
});


