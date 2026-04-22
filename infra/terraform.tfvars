aws_region                       = "eu-west-1"
aws_profile                      = "face-locator-operator"
nextjs_runtime_role_name         = "face-locator-amplify-compute"
public_base_url                 = "https://main.d1lne42ooc3wfs.amplifyapp.com"
database_network_migration_phase = "private"
database_private_subnets = [
  { availability_zone = "eu-west-1a", cidr_block = "172.31.200.0/24" },
  { availability_zone = "eu-west-1b", cidr_block = "172.31.201.0/24" }
]
enable_cognito_admin_auth = true
cognito_domain_prefix     = "face-locator-poc-admin"
cognito_callback_urls = [
  "http://localhost:3000/admin",
  "https://main.d1lne42ooc3wfs.amplifyapp.com/api/admin/callback",
]
cognito_logout_urls = [
  "http://localhost:3000/",
  "https://main.d1lne42ooc3wfs.amplifyapp.com/",
]
