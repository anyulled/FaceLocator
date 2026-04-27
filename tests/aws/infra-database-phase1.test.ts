import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const databaseTf = readFileSync(
  fileURLToPath(new URL("../../infra/database.tf", import.meta.url)),
  "utf8",
);
const secretsTf = readFileSync(
  fileURLToPath(new URL("../../infra/secrets.tf", import.meta.url)),
  "utf8",
);
const variablesTf = readFileSync(
  fileURLToPath(new URL("../../infra/variables.tf", import.meta.url)),
  "utf8",
);
const outputsTf = readFileSync(
  fileURLToPath(new URL("../../infra/outputs.tf", import.meta.url)),
  "utf8",
);
const tfvarsExample = readFileSync(
  fileURLToPath(new URL("../../infra/terraform.tfvars.example", import.meta.url)),
  "utf8",
);
const dbBoundaryDoc = readFileSync(
  fileURLToPath(new URL("../../docs/aws-database-boundary.md", import.meta.url)),
  "utf8",
);
const adr = readFileSync(
  fileURLToPath(new URL("../../adr/ADR-0001-aurora-serverless-phase1.md", import.meta.url)),
  "utf8",
);

describe("infra phase 1 aurora migration", () => {
  it("replaces the single RDS instance with Aurora Serverless v2 resources", () => {
    expect(databaseTf).toContain('resource "aws_rds_cluster" "poc"');
    expect(databaseTf).toContain('resource "aws_rds_cluster_instance" "poc"');
    expect(databaseTf).toMatch(/engine\s*=\s*"aurora-postgresql"/);
    expect(databaseTf).toContain("serverlessv2_scaling_configuration");
    expect(databaseTf).not.toContain('resource "aws_db_instance" "poc"');
  });

  it("keeps cluster subnet-grouped and AZ-redundant", () => {
    expect(databaseTf).toMatch(/db_subnet_group_name\s*=\s*aws_db_subnet_group\.poc\.name/);
    expect(databaseTf).toContain("Default VPC must include at least two subnets for Aurora Serverless deployment.");
    expect(databaseTf).toContain("publicly_accessible = true");
  });

  it("writes database secrets from Aurora cluster endpoint", () => {
    expect(secretsTf).toContain("host     = aws_rds_cluster.poc.endpoint");
    expect(secretsTf).toContain("port     = aws_rds_cluster.poc.port");
  });

  it("removes staged migration variable and adds Aurora tuning variables", () => {
    expect(variablesTf).not.toContain('variable "database_network_migration_phase"');
    expect(variablesTf).toContain('variable "aurora_postgresql_engine_version"');
    expect(variablesTf).toContain('variable "aurora_serverless_min_capacity"');
    expect(variablesTf).toContain('variable "aurora_serverless_max_capacity"');
  });

  it("publishes Aurora cluster outputs and drops migration phase output", () => {
    expect(outputsTf).toContain('output "database_cluster_endpoint"');
    expect(outputsTf).toContain('output "database_cluster_reader_endpoint"');
    expect(outputsTf).toContain('output "database_cluster_identifier"');
    expect(outputsTf).not.toContain('output "database_network_migration_phase"');
  });

  it("updates sample terraform inputs for Aurora", () => {
    expect(tfvarsExample).toContain("aurora_postgresql_engine_version");
    expect(tfvarsExample).toContain("aurora_serverless_min_capacity");
    expect(tfvarsExample).toContain("aurora_serverless_max_capacity");
    expect(tfvarsExample).not.toContain("database_private_subnets");
    expect(tfvarsExample).not.toContain("database_network_migration_phase");
  });

  it("documents the Aurora boundary and records an ADR", () => {
    expect(dbBoundaryDoc).toContain("Aurora PostgreSQL Serverless v2");
    expect(adr).toContain("# ADR-0001: Adopt Aurora PostgreSQL Serverless v2 For Phase 1");
    expect(adr).toContain("## Status");
    expect(adr).toContain("Accepted");
  });
});
