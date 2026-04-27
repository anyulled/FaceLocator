# Reconcile existing resources that are missing from local state
# These resources were likely created in a previous run but the state was lost or not saved.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

import {
  to = aws_security_group.db
  id = "sg-04bb2281781c99c0c"
}

import {
  to = aws_db_subnet_group.poc
  id = "face-locator-poc-db-subnets"
}

import {
  to = aws_iam_policy.nextjs_presign
  id = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/face-locator-poc-nextjs-presign"
}

import {
  to = aws_secretsmanager_secret.database
  id = "arn:aws:secretsmanager:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:secret:face-locator-poc-database-tDkA4V"
}

import {
  to = aws_secretsmanager_secret.match_link_signing
  id = "arn:aws:secretsmanager:${data.aws_region.current.id}:${data.aws_caller_identity.current.account_id}:secret:face-locator-poc-match-link-signing-secret-p3xYCz"
}
