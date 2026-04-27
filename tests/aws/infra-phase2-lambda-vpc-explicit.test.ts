import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const databaseTf = readFileSync(
  fileURLToPath(new URL("../../infra/database.tf", import.meta.url)),
  "utf8",
);
const lambdaTf = readFileSync(
  fileURLToPath(new URL("../../infra/lambda.tf", import.meta.url)),
  "utf8",
);
const adr = readFileSync(
  fileURLToPath(new URL("../../adr/ADR-0002-explicit-lambda-vpc-attachment.md", import.meta.url)),
  "utf8",
);

describe("infra phase 2 explicit lambda vpc attachment", () => {
  it("removes conditional local flag used for lambda VPC branching", () => {
    expect(databaseTf).not.toContain("use_lambda_vpc");
  });

  it("uses explicit vpc_config blocks for all lambda functions", () => {
    expect(lambdaTf).not.toContain('dynamic "vpc_config"');
    const vpcConfigBlocks = lambdaTf.match(/\n\s*vpc_config\s*\{/g) ?? [];
    expect(vpcConfigBlocks.length).toBe(5);
    expect(lambdaTf).toContain("aws_security_group.lambda_runtime.id");
  });

  it("documents the phase 2 decision in ADR", () => {
    expect(adr).toContain("# ADR-0002: Keep Lambda VPC Attachment Explicit With Private Aurora");
    expect(adr).toContain("Accepted");
  });
});
