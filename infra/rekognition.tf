resource "aws_rekognition_collection" "attendee_faces" {
  collection_id = local.rekognition_collection_id
}
