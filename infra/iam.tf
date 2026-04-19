data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
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
