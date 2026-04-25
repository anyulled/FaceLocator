import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const poolMock = vi.fn();

vi.mock("@aws-sdk/client-secrets-manager", () => ({
  GetSecretValueCommand: class GetSecretValueCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  },
  SecretsManagerClient: class SecretsManagerClient {
    send = sendMock;
  },
}));

const { onMock } = vi.hoisted(() => ({ onMock: vi.fn() }));

vi.mock("pg", () => ({
  Pool: class Pool {
    constructor(config: unknown) {
      poolMock(config);
    }

    on = onMock;
  },
}));


describe("database secret resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    poolMock.mockReset();
    delete process.env.FACE_LOCATOR_DATABASE_SECRET;
    delete process.env.FACE_LOCATOR_DATABASE_SECRET_NAME;
    delete process.env.FACE_LOCATOR_DATABASE_SECRET_ARN;
    delete process.env.DATABASE_SECRET_NAME;
    delete process.env.DATABASE_SECRET_ARN;
    delete process.env.AWS_REGION;

    sendMock.mockResolvedValue({
      SecretString: JSON.stringify({
        host: "db.example.test",
        port: 5432,
        dbname: "face_locator",
        username: "app_user",
        password: "secret",
      }),
    });
  });

  it("accepts the lambda-style DATABASE_SECRET_NAME contract", async () => {
    process.env.DATABASE_SECRET_NAME = "terraform-secret-name";

    const { getDatabasePool } = await import("@/lib/aws/database");
    await getDatabasePool();

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].input).toEqual({
      SecretId: "terraform-secret-name",
    });
    expect(poolMock).toHaveBeenCalledTimes(1);
  });

  it("uses the fallback secret name when no env is set", async () => {
    const { getDatabasePool } = await import("@/lib/aws/database");
    await getDatabasePool();
    expect(sendMock.mock.calls[0][0].input).toEqual({
      SecretId: "face-locator-poc-database",
    });
  });

  it("throws and logs on secret retrieval failure", async () => {
    sendMock.mockRejectedValue(new Error("SecretsManager error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    
    const { getDatabasePool } = await import("@/lib/aws/database");
    await expect(getDatabasePool()).rejects.toThrow("Database configuration is unavailable");
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("handles pool error events", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    
    const { getDatabasePool } = await import("@/lib/aws/database");
    await getDatabasePool();
    
    expect(onMock).toHaveBeenCalledWith("error", expect.any(Function));
    const errorHandler = onMock.mock.calls[0]?.[1] as (err: Error) => void;
    errorHandler(new Error("Pool failure"));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Unexpected PostgreSQL pool error"));
  });

  it("caches the pool when not in test runtime", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.PLAYWRIGHT_TEST_BASE_URL;
    delete process.env.TEST_WORKER_INDEX;
    
    const { getDatabasePool } = await import("@/lib/aws/database");
    const pool1 = await getDatabasePool();
    const pool2 = await getDatabasePool();
    
    expect(pool1).toBe(pool2);
  });
});
