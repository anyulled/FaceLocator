aws_region                               = "eu-west-1"
nextjs_runtime_role_name                 = "face-locator-amplify-compute"
public_base_url                          = "https://main.d1lne42ooc3wfs.amplifyapp.com"
database_allowed_cidr_blocks             = ["0.0.0.0/0"]
allow_broad_database_ingress             = true
enable_cognito_admin_auth                = true
ses_from_email                           = "anyulled@gmail.com"
enable_monthly_cost_budget_alarm         = true
monthly_cost_budget_limit_usd            = 50
cost_budget_notification_email           = "anyulled@gmail.com"
event_photo_match_schedule_expression    = "rate(6 hours)"
cognito_domain_prefix                    = "face-locator-poc-admin"
cognito_callback_urls = [
  "http://localhost:3000/admin",
  "http://localhost:3000/api/admin/callback",
  "http://localhost:3000/api/admin/token-callback",
  "https://main.d1lne42ooc3wfs.amplifyapp.com/api/admin/callback",
  "https://main.d1lne42ooc3wfs.amplifyapp.com/api/admin/token-callback",
]
cognito_logout_urls = [
  "http://localhost:3000/",
  "https://main.d1lne42ooc3wfs.amplifyapp.com/",
]
