resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db-sg"
  description = "Security group for POC database"

  ingress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

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
  password               = coalesce(var.database_password_override, random_password.database_password.result)
  skip_final_snapshot    = true
  publicly_accessible    = true
  vpc_security_group_ids = [aws_security_group.db.id]

  tags = local.common_tags
}
