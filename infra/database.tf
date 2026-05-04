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
      error_message = "Default VPC must include at least two subnets for PostgreSQL deployment."
    }
  }

  tags = local.common_tags
}

resource "aws_db_parameter_group" "poc" {
  name        = "${local.name_prefix}-postgres16"
  family      = "postgres16"
  description = "Hardened PostgreSQL parameters for FaceLocator public RDS boundary."

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  parameter {
    name  = "password_encryption"
    value = "scram-sha-256"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = local.common_tags
}

resource "aws_db_instance" "poc" {
  identifier                      = "${local.name_prefix}-db"
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = "db.t3.micro"
  allocated_storage               = 20
  db_name                         = var.database_name
  username                        = var.database_username
  password                        = local.database_password
  db_subnet_group_name            = aws_db_subnet_group.poc.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  parameter_group_name            = aws_db_parameter_group.poc.name
  publicly_accessible             = true
  storage_encrypted               = true
  deletion_protection             = true
  backup_retention_period         = 0
  copy_tags_to_snapshot           = true
  skip_final_snapshot             = true

  tags = local.common_tags
}
