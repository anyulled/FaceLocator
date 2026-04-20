data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default_vpc" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db-sg"
  description = "Security group for POC database"
  vpc_id      = data.aws_vpc.default.id

  dynamic "ingress" {
    for_each = toset(var.database_allowed_cidr_blocks)

    content {
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_db_subnet_group" "poc" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = data.aws_subnets.default_vpc.ids

  tags = local.common_tags
}

resource "aws_db_instance" "poc" {
  identifier             = "${local.name_prefix}-db"
  engine                 = "postgres"
  engine_version         = "16"
  instance_class         = "db.t3.micro"
  allocated_storage      = 20
  storage_type           = "gp3"
  db_name                = var.database_name
  username               = var.database_username
  password               = local.database_password
  skip_final_snapshot    = true
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.poc.name
  vpc_security_group_ids = [aws_security_group.db.id]

  tags = local.common_tags
}
