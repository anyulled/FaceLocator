resource "random_password" "database_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}:?~"
}

resource "aws_secretsmanager_secret" "database" {
  name                    = local.database_secret_name
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    host     = aws_db_instance.poc.address
    port     = aws_db_instance.poc.port
    dbname   = var.database_name
    username = var.database_username
    password = coalesce(var.database_password_override, random_password.database_password.result)
  })
}
