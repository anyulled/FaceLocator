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

variable "database_host" {
  description = "PostgreSQL host for the POC boundary. Replace before apply when a concrete database exists."
  type        = string
  default     = "replace-me.example.internal"
}

variable "database_port" {
  description = "PostgreSQL port for the POC boundary."
  type        = number
  default     = 5432
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
variable "aws_profile" {
  description = "AWS profile to use for the POC deployment."
  type        = string
  default     = "default"
}
