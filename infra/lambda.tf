resource "aws_cloudwatch_log_group" "selfie_enrollment" {
  name              = local.log_group_names.selfie_enrollment
  retention_in_days = var.cloudwatch_log_retention_days
}

resource "aws_cloudwatch_log_group" "event_photo_worker" {
  name              = local.log_group_names.event_photo_worker
  retention_in_days = var.cloudwatch_log_retention_days
}

resource "aws_cloudwatch_log_group" "matched_photo_notifier" {
  name              = local.log_group_names.matched_notifier
  retention_in_days = var.cloudwatch_log_retention_days
}

resource "aws_lambda_function" "selfie_enrollment" {
  function_name = local.lambda_names.selfie_enrollment
  role          = aws_iam_role.selfie_enrollment_lambda.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  filename      = local.lambda_package_paths.selfie_enrollment

  source_code_hash = try(filebase64sha256(local.lambda_package_paths.selfie_enrollment), null)
  timeout          = var.selfie_lambda_timeout_seconds
  memory_size      = var.selfie_lambda_memory_size

  environment {
    variables = {
      LOG_LEVEL                 = "info"
      SELFIES_BUCKET_NAME       = aws_s3_bucket.selfies.bucket
      REKOGNITION_COLLECTION_ID = aws_rekognition_collection.attendee_faces.collection_id
      DATABASE_SECRET_NAME      = aws_secretsmanager_secret.database.name
      DATABASE_SECRET_ARN       = aws_secretsmanager_secret.database.arn
    }
  }

  dynamic "vpc_config" {
    for_each = local.use_lambda_vpc ? [1] : []
    content {
      subnet_ids         = [for subnet in aws_subnet.db_private : subnet.id]
      security_group_ids = [aws_security_group.lambda_runtime[0].id]
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.selfie_enrollment,
    aws_iam_role_policy_attachment.selfie_enrollment_vpc_access,
  ]
}

resource "aws_lambda_function" "event_photo_worker" {
  function_name = local.lambda_names.event_photo_worker
  role          = aws_iam_role.event_photo_worker_lambda.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  filename      = local.lambda_package_paths.event_photo_worker

  source_code_hash = try(filebase64sha256(local.lambda_package_paths.event_photo_worker), null)
  timeout          = var.event_photo_lambda_timeout_seconds
  memory_size      = var.event_photo_lambda_memory_size

  environment {
    variables = {
      LOG_LEVEL                 = "info"
      EVENT_PHOTOS_BUCKET_NAME  = aws_s3_bucket.event_photos.bucket
      REKOGNITION_COLLECTION_ID = aws_rekognition_collection.attendee_faces.collection_id
      DATABASE_SECRET_NAME      = aws_secretsmanager_secret.database.name
      DATABASE_SECRET_ARN       = aws_secretsmanager_secret.database.arn
      SEARCH_FACES_ON_UPLOAD    = tostring(var.search_faces_on_event_photo_upload)
    }
  }

  dynamic "vpc_config" {
    for_each = local.use_lambda_vpc ? [1] : []
    content {
      subnet_ids         = [for subnet in aws_subnet.db_private : subnet.id]
      security_group_ids = [aws_security_group.lambda_runtime[0].id]
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.event_photo_worker,
    aws_iam_role_policy_attachment.event_photo_worker_vpc_access,
  ]
}

resource "aws_lambda_function" "matched_photo_notifier" {
  function_name = local.lambda_names.matched_notifier
  role          = aws_iam_role.matched_photo_notifier_lambda.arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  filename      = local.lambda_package_paths.matched_notifier

  source_code_hash = try(filebase64sha256(local.lambda_package_paths.matched_notifier), null)
  timeout          = var.matched_photo_notifier_lambda_timeout_seconds
  memory_size      = var.matched_photo_notifier_lambda_memory_size

  environment {
    variables = {
      LOG_LEVEL                     = "info"
      DATABASE_SECRET_NAME          = aws_secretsmanager_secret.database.name
      DATABASE_SECRET_ARN           = aws_secretsmanager_secret.database.arn
      MATCH_LINK_SIGNING_SECRET_ARN = aws_secretsmanager_secret.match_link_signing.arn
      MATCH_LINK_TTL_DAYS           = tostring(var.match_link_ttl_days)
      SES_FROM_EMAIL                = var.ses_from_email
    }
  }

  dynamic "vpc_config" {
    for_each = local.use_lambda_vpc ? [1] : []
    content {
      subnet_ids         = [for subnet in aws_subnet.db_private : subnet.id]
      security_group_ids = [aws_security_group.lambda_runtime[0].id]
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.matched_photo_notifier,
    aws_iam_role_policy_attachment.matched_photo_notifier_vpc_access,
  ]
}

resource "aws_cloudwatch_log_group" "admin_read" {
  count = var.enable_admin_backend_lambdas ? 1 : 0

  name              = local.log_group_names.admin_read
  retention_in_days = var.cloudwatch_log_retention_days
}

resource "aws_cloudwatch_log_group" "admin_write_events" {
  count = var.enable_admin_backend_lambdas ? 1 : 0

  name              = local.log_group_names.admin_write_events
  retention_in_days = var.cloudwatch_log_retention_days
}

resource "aws_cloudwatch_log_group" "admin_write_photos" {
  count = var.enable_admin_backend_lambdas ? 1 : 0

  name              = local.log_group_names.admin_write_photos
  retention_in_days = var.cloudwatch_log_retention_days
}

resource "aws_lambda_function" "admin_read" {
  count = var.enable_admin_backend_lambdas ? 1 : 0

  function_name = local.lambda_names.admin_read
  role          = aws_iam_role.admin_read_lambda[0].arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  filename      = local.lambda_package_paths.admin_read

  source_code_hash = try(filebase64sha256(local.lambda_package_paths.admin_read), null)
  timeout          = var.admin_read_lambda_timeout_seconds
  memory_size      = var.admin_read_lambda_memory_size

  environment {
    variables = {
      LOG_LEVEL                        = "info"
      FACE_LOCATOR_EVENT_PHOTOS_BUCKET = aws_s3_bucket.event_photos.bucket
      DATABASE_SECRET_NAME             = aws_secretsmanager_secret.database.name
      DATABASE_SECRET_ARN              = aws_secretsmanager_secret.database.arn
    }
  }

  dynamic "vpc_config" {
    for_each = local.use_lambda_vpc ? [1] : []
    content {
      subnet_ids         = [for subnet in aws_subnet.db_private : subnet.id]
      security_group_ids = [aws_security_group.lambda_runtime[0].id]
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.admin_read,
    aws_iam_role_policy_attachment.admin_read_vpc_access,
  ]
}

resource "aws_lambda_function" "admin_write_events" {
  count = var.enable_admin_backend_lambdas ? 1 : 0

  function_name = local.lambda_names.admin_write_events
  role          = aws_iam_role.admin_write_events_lambda[0].arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  filename      = local.lambda_package_paths.admin_write_events

  source_code_hash = try(filebase64sha256(local.lambda_package_paths.admin_write_events), null)
  timeout          = var.admin_write_events_lambda_timeout_seconds
  memory_size      = var.admin_write_events_lambda_memory_size

  environment {
    variables = {
      LOG_LEVEL            = "info"
      DATABASE_SECRET_NAME = aws_secretsmanager_secret.database.name
      DATABASE_SECRET_ARN  = aws_secretsmanager_secret.database.arn
    }
  }

  dynamic "vpc_config" {
    for_each = local.use_lambda_vpc ? [1] : []
    content {
      subnet_ids         = [for subnet in aws_subnet.db_private : subnet.id]
      security_group_ids = [aws_security_group.lambda_runtime[0].id]
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.admin_write_events,
    aws_iam_role_policy_attachment.admin_write_events_vpc_access,
  ]
}

resource "aws_lambda_function" "admin_write_photos" {
  count = var.enable_admin_backend_lambdas ? 1 : 0

  function_name = local.lambda_names.admin_write_photos
  role          = aws_iam_role.admin_write_photos_lambda[0].arn
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  filename      = local.lambda_package_paths.admin_write_photos

  source_code_hash = try(filebase64sha256(local.lambda_package_paths.admin_write_photos), null)
  timeout          = var.admin_write_photos_lambda_timeout_seconds
  memory_size      = var.admin_write_photos_lambda_memory_size

  environment {
    variables = {
      LOG_LEVEL                        = "info"
      FACE_LOCATOR_EVENT_PHOTOS_BUCKET = aws_s3_bucket.event_photos.bucket
      DATABASE_SECRET_NAME             = aws_secretsmanager_secret.database.name
      DATABASE_SECRET_ARN              = aws_secretsmanager_secret.database.arn
    }
  }

  dynamic "vpc_config" {
    for_each = local.use_lambda_vpc ? [1] : []
    content {
      subnet_ids         = [for subnet in aws_subnet.db_private : subnet.id]
      security_group_ids = [aws_security_group.lambda_runtime[0].id]
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.admin_write_photos,
    aws_iam_role_policy_attachment.admin_write_photos_vpc_access,
  ]
}

resource "aws_lambda_permission" "selfies_bucket_invoke" {
  statement_id  = "AllowExecutionFromSelfiesBucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.selfie_enrollment.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.selfies.arn
}

resource "aws_lambda_permission" "event_photos_bucket_invoke" {
  statement_id  = "AllowExecutionFromEventPhotosBucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event_photo_worker.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.event_photos.arn
}

resource "aws_s3_bucket_notification" "selfies" {
  bucket = aws_s3_bucket.selfies.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.selfie_enrollment.arn
    events              = ["s3:ObjectCreated:*"]
  }

  depends_on = [aws_lambda_permission.selfies_bucket_invoke]
}

resource "aws_s3_bucket_notification" "event_photos" {
  bucket = aws_s3_bucket.event_photos.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.event_photo_worker.arn
    events              = ["s3:ObjectCreated:*"]
  }

  depends_on = [aws_lambda_permission.event_photos_bucket_invoke]
}

resource "aws_scheduler_schedule" "matched_photo_notifier" {
  name                = "${local.lambda_names.matched_notifier}-schedule"
  schedule_expression = var.matched_photo_notifier_schedule_expression
  state               = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.matched_photo_notifier.arn
    role_arn = aws_iam_role.matched_photo_notifier_scheduler.arn
  }
}
