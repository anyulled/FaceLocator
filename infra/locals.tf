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

  lambda_package_paths = {
    selfie_enrollment  = "${path.module}/${var.lambda_package_dir}/selfie-enrollment.zip"
    event_photo_worker = "${path.module}/${var.lambda_package_dir}/event-photo-worker.zip"
  }

  log_group_names = {
    selfie_enrollment  = "/aws/lambda/${local.lambda_names.selfie_enrollment}"
    event_photo_worker = "/aws/lambda/${local.lambda_names.event_photo_worker}"
  }

  s3_encryption_algorithm     = "AES256"
  selfie_key_pattern          = "events/{eventId}/attendees/{attendeeId}/{fileName}"
  event_photo_pending_pattern = "events/pending/{eventId}/photos/{photoId}.jpg"
  event_photo_matched_pattern = "events/matched/{eventId}/photos/{photoId}.jpg"
  temporary_artifact_pattern  = "events/temporary/{eventId}/{artifactId}"

  selfie_upload_metadata_fields = [
    "event-id",
    "attendee-id",
    "registration-id",
    "consent-version",
  ]

  event_photo_metadata_fields = [
    "event-id",
    "photo-id",
    "uploaded-by",
  ]

  database_boundary = {
    engine             = "postgresql"
    bootstrap_sql_path = "${path.root}/scripts/sql/bootstrap.sql"
    logical_tables = [
      "events",
      "attendees",
      "event_attendees",
      "consents",
      "face_enrollments",
      "event_photos",
      "photo_face_matches",
    ]
  }
}
