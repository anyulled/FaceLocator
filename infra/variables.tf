variable "aws_region" {
  description = "AWS region for the POC deployment."
  type        = string
  default     = "eu-west-1"
}

variable "environment" {
  description = "Deployment environment name for the AWS POC."
  type        = string
  default     = "poc"
}

variable "project_name" {
  description = "Logical project name used in resource naming."
  type        = string
  default     = "face-locator"
}

variable "selfie_retention_days" {
  description = "Retention period for attendee selfies."
  type        = number
  default     = 30
}

variable "unmatched_event_photo_retention_days" {
  description = "Retention period for raw event photo uploads before they must be matched or copied elsewhere."
  type        = number
  default     = 2
}

variable "temporary_artifact_retention_days" {
  description = "Retention period for temporary derived artifacts."
  type        = number
  default     = 1
}

variable "matched_event_photo_retention_days" {
  description = "Retention period for matched event photos that remain accessible in gallery links."
  type        = number
  default     = 30
}

variable "cloudwatch_log_retention_days" {
  description = "CloudWatch log retention for worker Lambdas."
  type        = number
  default     = 14
}

variable "selfie_lambda_memory_size" {
  description = "Memory size in MB for the selfie enrollment Lambda."
  type        = number
  default     = 256
}

variable "selfie_lambda_timeout_seconds" {
  description = "Timeout in seconds for the selfie enrollment Lambda."
  type        = number
  default     = 30
}

variable "admin_events_read_lambda_memory_size" {
  description = "Memory size in MB for the admin events read Lambda."
  type        = number
  default     = 256
}

variable "admin_events_read_lambda_timeout_seconds" {
  description = "Timeout in seconds for the admin events read Lambda."
  type        = number
  default     = 20
}

variable "admin_events_read_lambda_reserved_concurrency" {
  description = "Reserved concurrency for the admin events read Lambda."
  type        = number
  default     = null
}

variable "event_photo_lambda_memory_size" {
  description = "Memory size in MB for the event photo worker Lambda."
  type        = number
  default     = 256
}

variable "event_photo_lambda_timeout_seconds" {
  description = "Timeout in seconds for the event photo worker Lambda."
  type        = number
  default     = 30
}

variable "matched_photo_notifier_lambda_memory_size" {
  description = "Memory size in MB for the matched photo notifier Lambda."
  type        = number
  default     = 256
}

variable "matched_photo_notifier_lambda_timeout_seconds" {
  description = "Timeout in seconds for the matched photo notifier Lambda."
  type        = number
  default     = 60
}

variable "matched_photo_notifier_schedule_expression" {
  description = "EventBridge Scheduler expression used to trigger matched photo email notifications."
  type        = string
  default     = "rate(12 hours)"
}

variable "match_link_ttl_days" {
  description = "Signed token TTL in days for gallery and unsubscribe links."
  type        = number
  default     = 30
}

variable "ses_from_email" {
  description = "Verified SES sender email used for matched photo notification emails."
  type        = string
  default     = "noreply@example.com"
}

variable "match_link_signing_secret_override" {
  description = "Optional override for the signing secret used for notification links. Leave null to generate one."
  type        = string
  default     = null
  sensitive   = true
}

variable "database_name" {
  description = "Database name for the POC boundary."
  type        = string
  default     = "face_locator"
}

variable "database_username" {
  description = "Database username for the POC boundary."
  type        = string
  default     = "face_locator_app"
}

variable "database_password_override" {
  description = "Optional password override for the database secret. Leave null to generate one."
  type        = string
  default     = null
  sensitive   = true
}

variable "database_allowed_cidr_blocks" {
  description = "Optional IPv4 CIDR blocks allowed to reach the PostgreSQL endpoint. Leave empty to keep the database unreachable from public networks."
  type        = list(string)
  default     = []
}

variable "database_network_migration_phase" {
  description = "Controls staged RDS networking migration. Use legacy -> prepare_private_subnets -> cutover_private_endpoint -> cutover_private_subnet_group/private."
  type        = string
  default     = "legacy"

  validation {
    condition = contains([
      "legacy",
      "prepare_private_subnets",
      "cutover_private_endpoint",
      "cutover_private_subnet_group",
      "private",
    ], lower(var.database_network_migration_phase))
    error_message = "database_network_migration_phase must be one of: legacy, prepare_private_subnets, cutover_private_endpoint, cutover_private_subnet_group, private."
  }
}

variable "database_private_subnets" {
  description = "Private subnets for RDS migration in the default VPC, one per AZ. Example: [{ availability_zone = \"eu-west-1a\", cidr_block = \"172.31.200.0/24\" }]."
  type = list(object({
    availability_zone = string
    cidr_block        = string
  }))
  default = []
}

variable "search_faces_on_event_photo_upload" {
  description = "Whether the event photo worker should call Rekognition search immediately."
  type        = bool
  default     = false
}

variable "lambda_package_dir" {
  description = "Directory containing prebuilt Lambda zip packages."
  type        = string
  default     = "../build/lambdas"
}

variable "enable_cognito_admin_auth" {
  description = "Whether to provision Cognito resources for admin authentication."
  type        = bool
  default     = true
}

variable "cognito_domain_prefix" {
  description = "Optional Cognito hosted UI domain prefix override. Must be globally unique in the AWS region."
  type        = string
  default     = null
}

variable "cognito_callback_urls" {
  description = "Allowed callback URLs for the Cognito app client."
  type        = list(string)
  default     = ["http://localhost:3000/admin"]
}

variable "cognito_logout_urls" {
  description = "Allowed sign-out URLs for the Cognito app client."
  type        = list(string)
  default     = ["http://localhost:3000/"]
}

variable "public_base_url" {
  description = "Public base URL used when generating event links."
  type        = string
  default     = "http://localhost:3000"
}

variable "cognito_admin_group_name" {
  description = "Cognito group name required for admin access."
  type        = string
  default     = "admin"
}

variable "cognito_bootstrap_admin_email" {
  description = "Optional initial admin user email to create and attach to the admin group."
  type        = string
  default     = null
}

variable "cognito_bootstrap_admin_temp_password" {
  description = "Optional temporary password for the bootstrap admin user. Leave null to auto-generate."
  type        = string
  default     = null
  sensitive   = true
}

variable "aws_profile" {
  description = "AWS profile to use for the POC deployment."
  type        = string
  default     = "default"
}

variable "nextjs_runtime_role_name" {
  description = "Optional IAM role name used by the hosted Next.js runtime. When set, Terraform attaches the required backend policies."
  type        = string
  default     = null
}
