data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default_vpc" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db-sg"
  description = "Security group for POC database"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_vpc_security_group_ingress_rule" "db_from_cidr" {
  for_each = toset(var.database_allowed_cidr_blocks)

  security_group_id = aws_security_group.db.id
  cidr_ipv4         = each.value
  from_port         = 5432
  to_port           = 5432
  ip_protocol       = "tcp"
  description       = "Operator-scoped PostgreSQL access"
}

resource "aws_db_subnet_group" "poc" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = data.aws_subnets.default_vpc.ids

  lifecycle {
    precondition {
      condition     = length(data.aws_subnets.default_vpc.ids) >= 2
      error_message = "Default VPC must include at least two subnets for Aurora Serverless deployment."
    }
  }

  tags = local.common_tags
}

resource "aws_rds_cluster" "poc" {
  cluster_identifier     = "${local.name_prefix}-cluster"
  engine                 = "aurora-postgresql"
  engine_version         = var.aurora_postgresql_engine_version
  database_name          = var.database_name
  master_username        = var.database_username
  master_password        = local.database_password
  db_subnet_group_name   = aws_db_subnet_group.poc.name
  vpc_security_group_ids = [aws_security_group.db.id]
  skip_final_snapshot    = true
  storage_encrypted      = true

  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_serverless_min_capacity
    max_capacity = var.aurora_serverless_max_capacity
  }

  tags = local.common_tags
}

resource "aws_rds_cluster_instance" "poc" {
  identifier          = "${local.name_prefix}-cluster-instance-1"
  cluster_identifier  = aws_rds_cluster.poc.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.poc.engine
  engine_version      = aws_rds_cluster.poc.engine_version
  publicly_accessible = true

  tags = local.common_tags
}
