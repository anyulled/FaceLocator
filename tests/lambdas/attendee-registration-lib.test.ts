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

type RegLib = {
  getRequiredEnv: (env: Record<string, string | undefined>) => {
    awsRegion: string;
    databaseSecretId: string;
    publicBaseUrl: string;
    selfiesBucketName: string;
    eventLogosBucketName: string;
  };
  getDatabaseConfig: (env: { awsRegion: string; databaseSecretId: string }) => Promise<Record<string, unknown>>;
};

const regLib = () => import("../../../lambdas/attendee-registration/lib.js") as Promise<RegLib>;

describe("lambdas/attendee-registration/lib — getRequiredEnv", () => {
  it("returns all env values with defaults", async () => {
    const { getRequiredEnv } = await regLib();
    const result = getRequiredEnv({});
    expect(result.awsRegion).toBe("eu-west-1");
    expect(result.databaseSecretId).toBe("face-locator-poc-database");
    expect(result.publicBaseUrl).toBe("https://localhost:3000");
    expect(result.selfiesBucketName).toBe("");
    expect(result.eventLogosBucketName).toBe("");
  });

  it("prefers FACE_LOCATOR_DATABASE_SECRET_ARN over other keys", async () => {
    const { getRequiredEnv } = await regLib();
    const result = getRequiredEnv({
      FACE_LOCATOR_DATABASE_SECRET_ARN: "arn:primary",
      DATABASE_SECRET_ARN: "arn:fallback",
    });
    expect(result.databaseSecretId).toBe("arn:primary");
  });

  it("falls back to DATABASE_SECRET_ARN", async () => {
    const { getRequiredEnv } = await regLib();
    const result = getRequiredEnv({ DATABASE_SECRET_ARN: "arn:fallback" });
    expect(result.databaseSecretId).toBe("arn:fallback");
  });

  it("falls back to FACE_LOCATOR_DATABASE_SECRET_NAME", async () => {
    const { getRequiredEnv } = await regLib();
    const result = getRequiredEnv({ FACE_LOCATOR_DATABASE_SECRET_NAME: "named-secret" });
    expect(result.databaseSecretId).toBe("named-secret");
  });

  it("uses SELFIES_BUCKET_NAME as fallback for selfies bucket", async () => {
    const { getRequiredEnv } = await regLib();
    const result = getRequiredEnv({ SELFIES_BUCKET_NAME: "selfies-backup" });
    expect(result.selfiesBucketName).toBe("selfies-backup");
  });

  it("uses FACE_LOCATOR_SELFIES_BUCKET over SELFIES_BUCKET_NAME", async () => {
    const { getRequiredEnv } = await regLib();
    const result = getRequiredEnv({
      FACE_LOCATOR_SELFIES_BUCKET: "primary-bucket",
      SELFIES_BUCKET_NAME: "fallback-bucket",
    });
    expect(result.selfiesBucketName).toBe("primary-bucket");
  });

  it("reads event logos bucket", async () => {
    const { getRequiredEnv } = await regLib();
    const result = getRequiredEnv({ FACE_LOCATOR_EVENT_LOGOS_BUCKET: "logos-bucket" });
    expect(result.eventLogosBucketName).toBe("logos-bucket");
  });

  it("uses supplied AWS_REGION", async () => {
    const { getRequiredEnv } = await regLib();
    const result = getRequiredEnv({ AWS_REGION: "us-east-1" });
    expect(result.awsRegion).toBe("us-east-1");
  });
});


