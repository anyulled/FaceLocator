import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const databaseTf = readFileSync(
  fileURLToPath(new URL("../../infra/database.tf", import.meta.url)),
  "utf8",
);
const adr = readFileSync(
  fileURLToPath(new URL("../../adr/ADR-0003-endpoint-sg-consolidation.md", import.meta.url)),
  "utf8",
);

describe("infra phase 3 endpoint SG consolidation", () => {
  it("removes dedicated private endpoint security group", () => {
    expect(databaseTf).not.toContain('resource "aws_security_group" "private_endpoints"');
  });

  it("uses lambda runtime SG for interface endpoints", () => {
    const lambdaEndpointSgRefs =
      databaseTf.match(/security_group_ids\s*=\s*\[aws_security_group\.lambda_runtime\.id\]/g) ?? [];

    expect(lambdaEndpointSgRefs.length).toBe(3);
    expect(databaseTf).toContain('resource "aws_vpc_endpoint" "secretsmanager"');
    expect(databaseTf).toContain('resource "aws_vpc_endpoint" "rekognition"');
    expect(databaseTf).toContain('resource "aws_vpc_endpoint" "ses"');
  });

  it("allows HTTPS from lambda runtime SG to itself for endpoint traffic", () => {
    expect(databaseTf).toContain('resource "aws_vpc_security_group_ingress_rule" "lambda_runtime_https_from_self"');
    expect(databaseTf).toContain("from_port                    = 443");
    expect(databaseTf).toContain("referenced_security_group_id = aws_security_group.lambda_runtime.id");
  });

  it("records phase 3 decision and constraints in ADR", () => {
    expect(adr).toContain("# ADR-0003: Consolidate Interface Endpoint Security Groups");
    expect(adr).toContain("Accepted");
    expect(adr).toContain("Interface endpoints remain required");
  });
});
