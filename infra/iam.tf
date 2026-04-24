data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "scheduler_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "nextjs_presign" {
  statement {
    sid = "AllowSelfieUploads"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:PutObject",
      "s3:PutObjectTagging",
    ]
    resources = ["${aws_s3_bucket.selfies.arn}/events/*/attendees/*/*"]
  }

  statement {
    sid = "AllowEventPhotoUploads"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:PutObject",
      "s3:PutObjectTagging",
    ]
    resources = ["${aws_s3_bucket.event_photos.arn}/events/pending/*"]
  }

}

resource "aws_iam_policy" "nextjs_presign" {
  name        = "${local.name_prefix}-nextjs-presign"
  description = "Least-privilege S3 upload permissions for the Next.js backend presign flow."
  policy      = data.aws_iam_policy_document.nextjs_presign.json
}

data "aws_iam_role" "nextjs_runtime" {
  count = trimspace(coalesce(var.nextjs_runtime_role_name, "")) == "" ? 0 : 1
  name  = trimspace(var.nextjs_runtime_role_name)
}

resource "aws_iam_role_policy_attachment" "nextjs_presign" {
  count      = length(data.aws_iam_role.nextjs_runtime) > 0 ? 1 : 0
  role       = data.aws_iam_role.nextjs_runtime[0].name
  policy_arn = aws_iam_policy.nextjs_presign.arn
}

data "aws_iam_policy_document" "nextjs_admin_events_read_invoke" {
  statement {
    sid       = "AllowInvokeAdminEventsReadLambda"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.admin_events_read.arn]
  }
}

resource "aws_iam_policy" "nextjs_admin_events_read_invoke" {
  name        = "${local.name_prefix}-nextjs-admin-events-read-invoke"
  description = "Least-privilege Lambda invoke permission for the Next.js backend admin read flow."
  policy      = data.aws_iam_policy_document.nextjs_admin_events_read_invoke.json
}

resource "aws_iam_role_policy_attachment" "nextjs_admin_events_read_invoke" {
  count      = length(data.aws_iam_role.nextjs_runtime) > 0 ? 1 : 0
  role       = data.aws_iam_role.nextjs_runtime[0].name
  policy_arn = aws_iam_policy.nextjs_admin_events_read_invoke.arn
}

data "aws_iam_policy_document" "nextjs_attendee_registration_invoke" {
  statement {
    sid       = "AllowInvokeAttendeeRegistrationLambda"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.attendee_registration.arn]
  }
}

resource "aws_iam_policy" "nextjs_attendee_registration_invoke" {
  name        = "${local.name_prefix}-nextjs-attendee-registration-invoke"
  description = "Least-privilege Lambda invoke permission for the Next.js public registration flow."
  policy      = data.aws_iam_policy_document.nextjs_attendee_registration_invoke.json
}

resource "aws_iam_role_policy_attachment" "nextjs_attendee_registration_invoke" {
  count      = length(data.aws_iam_role.nextjs_runtime) > 0 ? 1 : 0
  role       = data.aws_iam_role.nextjs_runtime[0].name
  policy_arn = aws_iam_policy.nextjs_attendee_registration_invoke.arn
}

data "aws_iam_policy_document" "nextjs_matched_photo_notifier_invoke" {
  statement {
    sid       = "AllowInvokeMatchedPhotoNotifierLambda"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.matched_photo_notifier.arn]
  }
}

resource "aws_iam_policy" "nextjs_matched_photo_notifier_invoke" {
  name        = "${local.name_prefix}-nextjs-matched-photo-notifier-invoke"
  description = "Least-privilege Lambda invoke permission for manual matched-photo notifications from the Next.js admin flow."
  policy      = data.aws_iam_policy_document.nextjs_matched_photo_notifier_invoke.json
}

resource "aws_iam_role_policy_attachment" "nextjs_matched_photo_notifier_invoke" {
  count      = length(data.aws_iam_role.nextjs_runtime) > 0 ? 1 : 0
  role       = data.aws_iam_role.nextjs_runtime[0].name
  policy_arn = aws_iam_policy.nextjs_matched_photo_notifier_invoke.arn
}

resource "aws_iam_role" "selfie_enrollment_lambda" {
  name               = "${local.lambda_names.selfie_enrollment}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "selfie_enrollment_lambda" {
  statement {
    sid       = "AllowCreateLogGroup"
    actions   = ["logs:CreateLogGroup"]
    resources = ["*"]
  }

  statement {
    sid = "AllowWriteSelfieLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.selfie_enrollment.arn}:*"]
  }

  statement {
    sid = "AllowReadSelfieObjects"
    actions = [
      "s3:GetObject",
      "s3:GetObjectTagging",
    ]
    resources = ["${aws_s3_bucket.selfies.arn}/events/*"]
  }

  statement {
    sid       = "AllowReadDatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.database.arn]
  }

  statement {
    sid       = "AllowFaceEnrollment"
    actions   = ["rekognition:IndexFaces"]
    resources = [aws_rekognition_collection.attendee_faces.arn]
  }
}

resource "aws_iam_role_policy" "selfie_enrollment_lambda" {
  name   = "${local.lambda_names.selfie_enrollment}-policy"
  role   = aws_iam_role.selfie_enrollment_lambda.id
  policy = data.aws_iam_policy_document.selfie_enrollment_lambda.json
}

resource "aws_iam_role_policy_attachment" "selfie_enrollment_vpc_access" {
  role       = aws_iam_role.selfie_enrollment_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role" "attendee_registration_lambda" {
  name               = "${local.lambda_names.attendee_registration}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "attendee_registration_lambda" {
  statement {
    sid       = "AllowCreateLogGroup"
    actions   = ["logs:CreateLogGroup"]
    resources = ["*"]
  }

  statement {
    sid = "AllowWriteAttendeeRegistrationLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.attendee_registration.arn}:*"]
  }

  statement {
    sid       = "AllowReadDatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.database.arn]
  }

  statement {
    sid = "AllowPresignSelfieUploads"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:PutObject",
      "s3:PutObjectTagging",
    ]
    resources = ["${aws_s3_bucket.selfies.arn}/events/*/attendees/*/*"]
  }
}

resource "aws_iam_role_policy" "attendee_registration_lambda" {
  name   = "${local.lambda_names.attendee_registration}-policy"
  role   = aws_iam_role.attendee_registration_lambda.id
  policy = data.aws_iam_policy_document.attendee_registration_lambda.json
}

resource "aws_iam_role_policy_attachment" "attendee_registration_vpc_access" {
  role       = aws_iam_role.attendee_registration_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role" "admin_events_read_lambda" {
  name               = "${local.lambda_names.admin_events_read}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "admin_events_read_lambda" {
  statement {
    sid       = "AllowCreateLogGroup"
    actions   = ["logs:CreateLogGroup"]
    resources = ["*"]
  }

  statement {
    sid = "AllowWriteAdminEventsReadLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.admin_events_read.arn}:*"]
  }

  statement {
    sid       = "AllowReadDatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.database.arn]
  }

  statement {
    sid = "AllowReadEventPhotoObjects"
    actions = [
      "s3:GetObject",
    ]
    resources = ["${aws_s3_bucket.event_photos.arn}/*"]
  }

  statement {
    sid = "AllowQueueEventPhotoObjects"
    actions = [
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.event_photos.arn}/events/pending/*"]
  }
}

resource "aws_iam_role_policy" "admin_events_read_lambda" {
  name   = "${local.lambda_names.admin_events_read}-policy"
  role   = aws_iam_role.admin_events_read_lambda.id
  policy = data.aws_iam_policy_document.admin_events_read_lambda.json
}

resource "aws_iam_role_policy_attachment" "admin_events_read_vpc_access" {
  role       = aws_iam_role.admin_events_read_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role" "event_photo_worker_lambda" {
  name               = "${local.lambda_names.event_photo_worker}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "event_photo_worker_lambda" {
  statement {
    sid       = "AllowCreateLogGroup"
    actions   = ["logs:CreateLogGroup"]
    resources = ["*"]
  }

  statement {
    sid = "AllowWriteEventPhotoLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.event_photo_worker.arn}:*"]
  }

  statement {
    sid = "AllowReadEventPhotoObjects"
    actions = [
      "s3:GetObject",
      "s3:GetObjectTagging",
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.event_photos.arn}/events/*"]
  }

  statement {
    sid       = "AllowReadDatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.database.arn]
  }

  statement {
    sid       = "AllowFaceSearch"
    actions   = ["rekognition:SearchFacesByImage"]
    resources = [aws_rekognition_collection.attendee_faces.arn]
  }
}

resource "aws_iam_role_policy" "event_photo_worker_lambda" {
  name   = "${local.lambda_names.event_photo_worker}-policy"
  role   = aws_iam_role.event_photo_worker_lambda.id
  policy = data.aws_iam_policy_document.event_photo_worker_lambda.json
}

resource "aws_iam_role_policy_attachment" "event_photo_worker_vpc_access" {
  role       = aws_iam_role.event_photo_worker_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role" "matched_photo_notifier_lambda" {
  name               = "${local.lambda_names.matched_notifier}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

data "aws_iam_policy_document" "matched_photo_notifier_lambda" {
  statement {
    sid       = "AllowCreateLogGroup"
    actions   = ["logs:CreateLogGroup"]
    resources = ["*"]
  }

  statement {
    sid = "AllowWriteNotifierLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.matched_photo_notifier.arn}:*"]
  }

  statement {
    sid       = "AllowReadDatabaseSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.database.arn]
  }

  statement {
    sid       = "AllowReadSigningSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.match_link_signing.arn]
  }

  statement {
    sid = "AllowReadMatchedEventPhotoObjects"
    actions = [
      "s3:GetObject",
    ]
    resources = ["${aws_s3_bucket.event_photos.arn}/events/matched/*"]
  }

  statement {
    sid = "AllowSesSendEmail"
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "matched_photo_notifier_lambda" {
  name   = "${local.lambda_names.matched_notifier}-policy"
  role   = aws_iam_role.matched_photo_notifier_lambda.id
  policy = data.aws_iam_policy_document.matched_photo_notifier_lambda.json
}

resource "aws_iam_role_policy_attachment" "matched_photo_notifier_vpc_access" {
  role       = aws_iam_role.matched_photo_notifier_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role" "matched_photo_notifier_scheduler" {
  name               = "${local.lambda_names.matched_notifier}-scheduler-role"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume_role.json
}

data "aws_iam_policy_document" "matched_photo_notifier_scheduler" {
  statement {
    sid       = "AllowInvokeNotifierLambda"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.matched_photo_notifier.arn]
  }
}

resource "aws_iam_role_policy" "matched_photo_notifier_scheduler" {
  name   = "${local.lambda_names.matched_notifier}-scheduler-policy"
  role   = aws_iam_role.matched_photo_notifier_scheduler.id
  policy = data.aws_iam_policy_document.matched_photo_notifier_scheduler.json
}
