aws_region                               = "eu-west-1"
aws_profile                              = "face-locator-operator"
nextjs_runtime_role_name                 = "face-locator-amplify-compute"
public_base_url                          = "https://main.d1lne42ooc3wfs.amplifyapp.com"
admin_events_read_lambda_timeout_seconds = 120
enable_cognito_admin_auth                = true
search_faces_on_event_photo_upload       = true
ses_from_email                           = "anyulled@gmail.com"
enable_monthly_cost_budget_alarm         = true
monthly_cost_budget_limit_usd            = 50
cost_budget_notification_email           = "anyulled@gmail.com"
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
