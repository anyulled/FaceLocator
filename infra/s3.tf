resource "aws_s3_bucket" "selfies" {
  bucket = local.bucket_names.selfies
}

resource "aws_s3_bucket_public_access_block" "selfies" {
  bucket                  = aws_s3_bucket.selfies.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "selfies" {
  bucket = aws_s3_bucket.selfies.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = local.s3_encryption_algorithm
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "selfies" {
  bucket = aws_s3_bucket.selfies.id

  rule {
    id     = "expire-selfies"
    status = "Enabled"

    filter {
      prefix = "events/"
    }

    expiration {
      days = var.selfie_retention_days
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "selfies" {
  bucket = aws_s3_bucket.selfies.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_origins = [
      "https://face-locator-enrollment.localhost",
      var.public_base_url,
    ]
    expose_headers  = ["ETag", "x-amz-request-id"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket" "event_photos" {
  bucket = local.bucket_names.event_photos
}

resource "aws_s3_bucket_public_access_block" "event_photos" {
  bucket                  = aws_s3_bucket.event_photos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "event_photos" {
  bucket = aws_s3_bucket.event_photos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = local.s3_encryption_algorithm
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "event_photos" {
  bucket = aws_s3_bucket.event_photos.id

  rule {
    id     = "expire-unmatched-pending-event-photos"
    status = "Enabled"

    filter {
      prefix = "events/pending/"
    }

    expiration {
      days = var.unmatched_event_photo_retention_days
    }
  }

  rule {
    id     = "expire-temporary-artifacts"
    status = "Enabled"

    filter {
      prefix = "events/temporary/"
    }

    expiration {
      days = var.temporary_artifact_retention_days
    }
  }

  rule {
    id     = "expire-matched-event-photos"
    status = "Enabled"

    filter {
      prefix = "events/matched/"
    }

    expiration {
      days = var.matched_event_photo_retention_days
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "event_photos" {
  bucket = aws_s3_bucket.event_photos.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT"]
    allowed_origins = [
      "https://face-locator-enrollment.localhost",
      var.public_base_url,
    ]
    expose_headers  = ["ETag", "x-amz-request-id"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket" "event_logos" {
  bucket = local.bucket_names.event_logos
}

resource "aws_s3_bucket_public_access_block" "event_logos" {
  bucket                  = aws_s3_bucket.event_logos.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_server_side_encryption_configuration" "event_logos" {
  bucket = aws_s3_bucket.event_logos.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = local.s3_encryption_algorithm
    }
  }
}

data "aws_iam_policy_document" "event_logos_public_read" {
  statement {
    sid    = "AllowPublicReadEventLogos"
    effect = "Allow"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.event_logos.arn}/*",
    ]
  }
}

resource "aws_s3_bucket_policy" "event_logos_public_read" {
  bucket = aws_s3_bucket.event_logos.id
  policy = data.aws_iam_policy_document.event_logos_public_read.json

  depends_on = [aws_s3_bucket_public_access_block.event_logos]
}
