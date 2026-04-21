output "selfies_bucket_name" {
  description = "Private S3 bucket used for attendee selfie uploads."
  value       = aws_s3_bucket.selfies.bucket
}

output "event_photos_bucket_name" {
  description = "Private S3 bucket used for event photo uploads."
  value       = aws_s3_bucket.event_photos.bucket
}

output "rekognition_collection_id" {
  description = "Rekognition collection id for attendee face enrollment."
  value       = aws_rekognition_collection.attendee_faces.collection_id
}

output "database_secret_name" {
  description = "Secrets Manager secret name holding PostgreSQL connection details."
  value       = aws_secretsmanager_secret.database.name
}

output "selfie_enrollment_lambda_name" {
  description = "Selfie enrollment Lambda function name."
  value       = aws_lambda_function.selfie_enrollment.function_name
}

output "event_photo_worker_lambda_name" {
  description = "Event photo worker Lambda function name."
  value       = aws_lambda_function.event_photo_worker.function_name
}

output "matched_photo_notifier_lambda_name" {
  description = "Matched photo notifier Lambda function name."
  value       = aws_lambda_function.matched_photo_notifier.function_name
}

output "nextjs_presign_policy_arn" {
  description = "Policy ARN to attach to the Next.js backend runtime principal for presigned uploads."
  value       = aws_iam_policy.nextjs_presign.arn
}

output "match_link_signing_secret_name" {
  description = "Secrets Manager secret name holding the matched photo link signing secret."
  value       = aws_secretsmanager_secret.match_link_signing.name
}

output "database_bootstrap_sql_path" {
  description = "Path to the SQL bootstrap placeholder for the PostgreSQL boundary."
  value       = local.database_boundary.bootstrap_sql_path
}

output "selfie_upload_key_pattern" {
  description = "Canonical S3 key pattern for attendee selfies."
  value       = local.selfie_key_pattern
}

output "event_photo_pending_key_pattern" {
  description = "Canonical S3 key pattern for pending event photos."
  value       = local.event_photo_pending_pattern
}

output "database_network_migration_phase" {
  description = "Current staged migration phase for RDS networking."
  value       = local.database_network_migration_phase
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID used for admin authentication."
  value       = try(aws_cognito_user_pool.admin[0].id, null)
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool App Client ID for admin web login."
  value       = try(aws_cognito_user_pool_client.admin_web[0].id, null)
}

output "cognito_user_pool_issuer" {
  description = "Cognito issuer URL to set as COGNITO_ISSUER for admin JWT verification."
  value       = try("https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.admin[0].id}", null)
}

output "cognito_hosted_ui_domain" {
  description = "Cognito hosted UI domain for admin sign-in."
  value       = try("${aws_cognito_user_pool_domain.admin[0].domain}.auth.${var.aws_region}.amazoncognito.com", null)
}

output "cognito_admin_group_name" {
  description = "Cognito group name required for admin route access."
  value       = var.cognito_admin_group_name
}
