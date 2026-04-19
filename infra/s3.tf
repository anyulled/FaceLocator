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
}
