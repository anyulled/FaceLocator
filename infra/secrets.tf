resource "random_password" "database_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "database" {
  name                    = local.database_secret_name
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    host     = var.database_host
    port     = var.database_port
    dbname   = var.database_name
    username = var.database_username
    password = coalesce(var.database_password_override, random_password.database_password.result)
  })
}
