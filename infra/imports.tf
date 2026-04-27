# Reconcile existing resources that are missing from local state
# These resources were likely created in a previous run but the state was lost or not saved.

import {
  to = aws_cognito_user_pool_domain.admin[0]
  id = "face-locator-poc-admin"
}

import {
  to = aws_security_group.db
  id = "sg-04bb2281781c99c0c"
}

import {
  to = aws_security_group.lambda_runtime[0]
  id = "sg-0f099376dc60458fc"
}

import {
  to = aws_iam_policy.nextjs_presign
  id = "arn:aws:iam::722851018992:policy/face-locator-poc-nextjs-presign"
}

import {
  to = aws_secretsmanager_secret.database
  id = "arn:aws:secretsmanager:eu-west-1:722851018992:secret:face-locator-poc-database-tDkA4V"
}

import {
  to = aws_secretsmanager_secret.match_link_signing
  id = "arn:aws:secretsmanager:eu-west-1:722851018992:secret:face-locator-poc-match-link-signing-secret-p3xYCz"
}
