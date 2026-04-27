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
  fileURLToPath(new URL("../../adr/ADR-0004-remove-singleton-count-index-patterns.md", import.meta.url)),
  "utf8",
);

describe("infra phase 4 singleton cleanup", () => {
  it("removes singleton count=1 wrappers from persistent networking resources", () => {
    expect(databaseTf).not.toContain('resource "aws_route_table" "db_private" {\n  count = 1');
    expect(databaseTf).not.toContain('resource "aws_security_group" "lambda_runtime" {\n  count = 1');
    expect(databaseTf).not.toContain('resource "aws_vpc_endpoint" "s3_gateway" {\n  count = 1');
    expect(databaseTf).not.toContain('resource "aws_vpc_endpoint" "secretsmanager" {\n  count = 1');
    expect(databaseTf).not.toContain('resource "aws_vpc_endpoint" "rekognition" {\n  count = 1');
    expect(databaseTf).not.toContain('resource "aws_vpc_endpoint" "ses" {\n  count = 1');
  });

  it("removes singleton [0] indexing for lambda runtime SG and route table references", () => {
    expect(databaseTf).not.toContain("aws_security_group.lambda_runtime[0].id");
    expect(databaseTf).not.toContain("aws_route_table.db_private[0].id");
    expect(lambdaTf).not.toContain("aws_security_group.lambda_runtime[0].id");
    expect(databaseTf).toContain("aws_security_group.lambda_runtime.id");
    expect(databaseTf).toContain("aws_route_table.db_private.id");
  });

  it("keeps explicit VPC attachment for all Lambda functions", () => {
    const vpcConfigBlocks = lambdaTf.match(/\n\s*vpc_config\s*\{/g) ?? [];
    expect(vpcConfigBlocks.length).toBe(5);
    expect(lambdaTf).toContain("aws_security_group.lambda_runtime.id");
  });

  it("documents the phase 4 decision in ADR", () => {
    expect(adr).toContain("# ADR-0004: Remove Singleton Count And Index Patterns In Infra");
    expect(adr).toContain("Accepted");
  });
});
