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
