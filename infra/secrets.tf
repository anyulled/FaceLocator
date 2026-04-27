resource "random_password" "database_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}:?~"
}

resource "random_password" "match_link_signing_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "database" {
  name                    = local.database_secret_name
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "database" {
  secret_id = aws_secretsmanager_secret.database.id
  secret_string = jsonencode({
    host     = aws_rds_cluster.poc.endpoint
    port     = aws_rds_cluster.poc.port
    dbname   = var.database_name
    username = var.database_username
    password = local.database_password
  })
}

resource "aws_secretsmanager_secret" "match_link_signing" {
  name                    = local.match_link_signing_secret_name
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "match_link_signing" {
  secret_id     = aws_secretsmanager_secret.match_link_signing.id
  secret_string = local.match_link_signing_secret_value
}
