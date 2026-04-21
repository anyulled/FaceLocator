data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default_vpc" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

locals {
  database_network_migration_phase = lower(var.database_network_migration_phase)
  use_private_db_subnets = contains([
    "prepare_private_subnets",
    "cutover_private_endpoint",
    "cutover_private_subnet_group",
    "private",
  ], local.database_network_migration_phase)

  db_private_subnets_by_az = {
    for subnet in var.database_private_subnets :
    subnet.availability_zone => subnet
  }

  db_publicly_accessible = contains([
    "cutover_private_endpoint",
    "cutover_private_subnet_group",
    "private",
  ], local.database_network_migration_phase) ? false : true

  use_lambda_vpc = local.use_private_db_subnets
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
  for_each = local.use_private_db_subnets ? local.db_private_subnets_by_az : {}

  vpc_id                  = data.aws_vpc.default.id
  cidr_block              = each.value.cidr_block
  availability_zone       = each.value.availability_zone
  map_public_ip_on_launch = false

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-private-${replace(each.value.availability_zone, "-", "")}"
  })
}

resource "aws_route_table" "db_private" {
  count = local.use_private_db_subnets ? 1 : 0

  vpc_id = data.aws_vpc.default.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-db-private-rt"
  })
}

resource "aws_route_table_association" "db_private" {
  for_each = local.use_private_db_subnets ? aws_subnet.db_private : {}

  subnet_id      = each.value.id
  route_table_id = aws_route_table.db_private[0].id
}

resource "aws_security_group" "lambda_runtime" {
  count = local.use_lambda_vpc ? 1 : 0

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
  count = local.use_lambda_vpc ? 1 : 0

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
  count = local.use_lambda_vpc ? 1 : 0

  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = aws_security_group.lambda_runtime[0].id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "Allow private Lambda runtime access to PostgreSQL"
}

resource "aws_vpc_endpoint" "s3_gateway" {
  count = local.use_lambda_vpc ? 1 : 0

  vpc_id            = data.aws_vpc.default.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.db_private[0].id]

  tags = local.common_tags
}

resource "aws_vpc_endpoint" "secretsmanager" {
  count = local.use_lambda_vpc ? 1 : 0

  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [for subnet in aws_subnet.db_private : subnet.id]
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.private_endpoints[0].id]

  tags = local.common_tags
}

resource "aws_vpc_endpoint" "rekognition" {
  count = local.use_lambda_vpc ? 1 : 0

  vpc_id              = data.aws_vpc.default.id
  service_name        = "com.amazonaws.${var.aws_region}.rekognition"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = [for subnet in aws_subnet.db_private : subnet.id]
  private_dns_enabled = true
  security_group_ids  = [aws_security_group.private_endpoints[0].id]

  tags = local.common_tags
}

resource "aws_vpc_endpoint" "ses" {
  count = local.use_lambda_vpc ? 1 : 0

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
  subnet_ids = local.use_private_db_subnets ? [for subnet in aws_subnet.db_private : subnet.id] : data.aws_subnets.default_vpc.ids

  lifecycle {
    precondition {
      condition = !local.use_private_db_subnets || (
        length(var.database_private_subnets) >= 2 &&
        length(keys(local.db_private_subnets_by_az)) == length(var.database_private_subnets)
      )
      error_message = "When database_network_migration_phase uses private subnets, provide at least 2 database_private_subnets in distinct AZs."
    }
  }

  tags = local.common_tags
}

resource "aws_db_instance" "poc" {
  identifier          = "${local.name_prefix}-db"
  engine              = "postgres"
  engine_version      = "16"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  storage_type        = "gp3"
  db_name             = var.database_name
  username            = var.database_username
  password            = local.database_password
  skip_final_snapshot = true
  publicly_accessible = local.db_publicly_accessible
  db_subnet_group_name = contains([
    "cutover_private_subnet_group",
    "private",
  ], local.database_network_migration_phase) ? aws_db_subnet_group.poc.name : "default"
  vpc_security_group_ids = [aws_security_group.db.id]

  tags = local.common_tags
}
