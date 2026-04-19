locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  bucket_names = {
    selfies      = "${local.name_prefix}-selfies"
    event_photos = "${local.name_prefix}-event-photos"
  }

  lambda_names = {
    selfie_enrollment  = "${local.name_prefix}-selfie-enrollment"
    event_photo_worker = "${local.name_prefix}-event-photo-worker"
  }

  rekognition_collection_id = "${local.name_prefix}-faces"
  database_secret_name      = "${local.name_prefix}-database"
}
