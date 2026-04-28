resource "terraform_data" "database_schema_bootstrap" {
  count = var.enable_database_schema_bootstrap ? 1 : 0

  triggers_replace = {
    db_endpoint     = aws_db_instance.poc.address
    db_name         = var.database_name
    db_username     = var.database_username
    schema_checksum = filesha256("${path.root}/../scripts/sql/bootstrap.sql")
  }

  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-lc"]
    command     = "psql -v ON_ERROR_STOP=1 -f \"${path.root}/../scripts/sql/bootstrap.sql\""

    environment = {
      PGHOST     = aws_db_instance.poc.address
      PGPORT     = tostring(aws_db_instance.poc.port)
      PGDATABASE = var.database_name
      PGUSER     = var.database_username
      PGPASSWORD = local.database_password
      PGSSLMODE  = "require"
    }
  }

  depends_on = [aws_db_instance.poc]
}
