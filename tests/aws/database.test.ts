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

vi.mock("pg", () => ({
  Pool: class Pool {
    constructor(config: unknown) {
      poolMock(config);
    }
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
});
