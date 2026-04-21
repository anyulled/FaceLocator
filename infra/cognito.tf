locals {
  cognito_domain_prefix = coalesce(
    var.cognito_domain_prefix,
    substr(replace(lower("${local.name_prefix}-admin"), "_", "-"), 0, 63)
  )
}

resource "random_password" "cognito_bootstrap_admin_temp" {
  count   = var.enable_cognito_admin_auth && var.cognito_bootstrap_admin_email != null && var.cognito_bootstrap_admin_temp_password == null ? 1 : 0
  length  = 20
  special = true

  override_special = "!@#$%^&*()-_=+[]{}"
}

resource "aws_cognito_user_pool" "admin" {
  count = var.enable_cognito_admin_auth ? 1 : 0

  name = "${local.name_prefix}-admin"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }
}

resource "aws_cognito_user_pool_client" "admin_web" {
  count = var.enable_cognito_admin_auth ? 1 : 0

  name         = "${local.name_prefix}-admin-web"
  user_pool_id = aws_cognito_user_pool.admin[0].id

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = var.cognito_callback_urls
  logout_urls   = var.cognito_logout_urls

  generate_secret                               = false
  prevent_user_existence_errors                 = "ENABLED"
  enable_token_revocation                       = true
  enable_propagate_additional_user_context_data = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "admin" {
  count = var.enable_cognito_admin_auth ? 1 : 0

  domain       = local.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.admin[0].id
}

resource "aws_cognito_user_group" "admin" {
  count = var.enable_cognito_admin_auth ? 1 : 0

  user_pool_id = aws_cognito_user_pool.admin[0].id
  name         = var.cognito_admin_group_name
  description  = "Admin operators allowed to access /admin routes."
}

resource "aws_cognito_user" "bootstrap_admin" {
  count = var.enable_cognito_admin_auth && var.cognito_bootstrap_admin_email != null ? 1 : 0

  user_pool_id = aws_cognito_user_pool.admin[0].id
  username     = var.cognito_bootstrap_admin_email

  desired_delivery_mediums = ["EMAIL"]
  temporary_password = coalesce(
    var.cognito_bootstrap_admin_temp_password,
    try(random_password.cognito_bootstrap_admin_temp[0].result, null),
  )

  attributes = {
    email          = var.cognito_bootstrap_admin_email
    email_verified = "true"
  }
}

resource "aws_cognito_user_in_group" "bootstrap_admin" {
  count = var.enable_cognito_admin_auth && var.cognito_bootstrap_admin_email != null ? 1 : 0

  user_pool_id = aws_cognito_user_pool.admin[0].id
  username     = aws_cognito_user.bootstrap_admin[0].username
  group_name   = aws_cognito_user_group.admin[0].name
}
