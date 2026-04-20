# T09 — Create event-photo worker Lambda

## Objective
Provision a Lambda function triggered by event-photo uploads.

## Responsibilities
- receive S3 object-created event from the event-photos bucket
- register metadata about the uploaded event photo in the database
- prepare the photo for later comparison/search against enrolled faces
- optionally call Rekognition search if this POC includes immediate matching

## Constraints
- keep logic narrow
- no workflow engine
- no queue unless strictly necessary

## Acceptance criteria
- Terraform provisions the Lambda
- event-photo bucket triggers the function
- minimum environment variables are provided
