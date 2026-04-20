# T11 — Define least-privilege IAM for Next.js presign operations

## Objective
Create the minimum AWS permissions required by the Next.js backend to issue presigned uploads.

## Scope
The Next.js backend needs to generate upload instructions for:
- attendee selfies
- staff/photographer event photo uploads

## Requirements
- separate policy from Lambda worker roles
- allow only the S3 actions needed to sign uploads
- scope access to the specific bucket/prefix patterns used by the app
- no read access to unrelated prefixes unless justified

## Acceptance criteria
- policy is narrow and documented
- no wildcard admin policy is used
