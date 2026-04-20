# T08 — Create selfie enrollment Lambda

## Objective
Provision a Lambda function triggered by selfie uploads.

## Responsibilities
- receive S3 object-created event from the selfies bucket
- read object metadata
- call Rekognition `IndexFaces`
- persist enrollment result in the database
- update attendee enrollment status

## Technical constraints
- single Lambda
- Node.js runtime
- modest timeout and memory
- packaged independently from Next.js app

## Acceptance criteria
- Terraform provisions the Lambda
- required environment variables are present
- CloudWatch log group exists or is created automatically
