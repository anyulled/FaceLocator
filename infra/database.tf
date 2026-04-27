data "aws_vpc" "default" {
  default = true
}

locals {
  db_private_subnets_by_az = {
    for subnet in var.database_private_subnets :
    subnet.availability_zone => subnet
  }

  use_private_db_subnets = true
  use_lambda_vpc         = true
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

resource "aws_subnet" "db_private" {
  for_each = local.db_private_subnets_by_az

  vpc_id                  = data.aws_vpc.default.id
  cidr_block              = each.value.cidr_block
  availability_zone       = each.value.availability_zone
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-private-${replace(each.value.availability_zone, "-", "")}"
  })
}

resource "aws_route_table" "db_private" {
  count = 1

  vpc_id = data.aws_vpc.default.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-private-rt"
  })
}

resource "aws_route_table_association" "db_private" {
  for_each = aws_subnet.db_private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.db_private[0].id
}

resource "aws_security_group" "lambda_runtime" {
  count = 1

  name        = "${local.name_prefix}-lambda-runtime-sg"
  description = "Security group for private Lambda runtime networking"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_security_group" "private_endpoints" {
  count = 1

  name        = "${local.name_prefix}-private-endpoints-sg"
  description = "Security group for interface VPC endpoints used by Lambdas"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.lambda_runtime[0].id]
    description     = "Allow Lambda runtime to reach AWS service endpoints"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_vpc_security_group_ingress_rule" "db_from_lambda" {
  count = 1

  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.lambda_runtime[0].id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "Allow private Lambda runtime access to PostgreSQL"
}

resource "aws_vpc_endpoint" "s3_gateway" {
  count = 1

  vpc_id            = data.aws_vpc.default.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.db_private[0].id]

  tags = local.common_tags
}

resource "aws_vpc_endpoint" "secretsmanager" {
  count = 1

  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [for subnet in aws_subnet.db_private : subnet.id]
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.private_endpoints[0].id]

  tags = local.common_tags
}

resource "aws_vpc_endpoint" "rekognition" {
  count = 1

  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.rekognition"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [for subnet in aws_subnet.db_private : subnet.id]
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.private_endpoints[0].id]

  tags = local.common_tags
}

resource "aws_vpc_endpoint" "ses" {
  count = 1

  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.email"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [for subnet in aws_subnet.db_private : subnet.id]
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.private_endpoints[0].id]

  tags = local.common_tags
}

resource "aws_db_subnet_group" "poc" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = [for subnet in aws_subnet.db_private : subnet.id]

  lifecycle {
    precondition {
      condition = (
        length(var.database_private_subnets) >= 2 &&
        length(keys(local.db_private_subnets_by_az)) == length(var.database_private_subnets)
      )
      error_message = "Provide at least 2 database_private_subnets in distinct AZs for Aurora Serverless deployment."
    }
  }

  tags = local.common_tags
}

resource "aws_rds_cluster" "poc" {
  cluster_identifier = "${local.name_prefix}-cluster"
  engine             = "aurora-postgresql"
  engine_version     = var.aurora_postgresql_engine_version
  database_name      = var.database_name
  master_username    = var.database_username
  master_password    = local.database_password
  db_subnet_group_name = aws_db_subnet_group.poc.name
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
  identifier         = "${local.name_prefix}-cluster-instance-1"
  cluster_identifier = aws_rds_cluster.poc.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.poc.engine
  engine_version     = aws_rds_cluster.poc.engine_version
  publicly_accessible = false

  tags = local.common_tags
}
