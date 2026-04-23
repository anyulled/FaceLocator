import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getDatabasePool } from "@/lib/aws/database";

type GalleryPhotoRow = {
  objectKey: string;
};

type GalleryIdentityRow = {
  attendeeName: string;
};

const PHOTO_URL_TTL_SECONDS = 15 * 60;

function getEventPhotosBucketName() {
  const bucketName = process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET;
  if (!bucketName) {
    throw new Error("FACE_LOCATOR_EVENT_PHOTOS_BUCKET is required.");
  }
  return bucketName;
}

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION ?? "eu-west-1",
  });
}

export async function getMatchedGalleryData(input: {
  eventId: string;
  attendeeId: string;
  faceId: string;
}) {
  const pool = await getDatabasePool();

  const attendeeRes = await pool.query<GalleryIdentityRow>(
    `
      SELECT a.name AS "attendeeName"
      FROM attendees a
      WHERE a.id = $1
      LIMIT 1
    `,
    [input.attendeeId],
  );

  const attendee = attendeeRes.rows[0];
  if (!attendee) {
    return null;
  }

  const photoRes = await pool.query<GalleryPhotoRow>(
    `
      SELECT DISTINCT ep.object_key AS "objectKey"
      FROM photo_face_matches m
      JOIN event_photos ep ON ep.id = m.event_photo_id
      JOIN face_enrollments fe ON fe.id = m.face_enrollment_id
      WHERE ep.event_id = $1
        AND m.attendee_id = $2
        AND fe.rekognition_face_id = $3
        AND ep.deleted_at IS NULL
      ORDER BY ep.object_key DESC
    `,
    [input.eventId, input.attendeeId, input.faceId],
  );

  const s3Client = getS3Client();
  const bucketName = getEventPhotosBucketName();

  const photoUrls = await Promise.all(
    photoRes.rows.map(async (row) => {
      const signedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: row.objectKey,
        }),
        {
          expiresIn: PHOTO_URL_TTL_SECONDS,
        },
      );

      return signedUrl;
    }),
  );

  return {
    attendeeName: attendee.attendeeName,
    photoUrls,
  };
}

export async function unsubscribeFromMatchedPhotoNotifications(input: {
  eventId: string;
  attendeeId: string;
}) {
  const pool = await getDatabasePool();

  await pool.query(
    `
      UPDATE event_attendees
      SET photo_notifications_unsubscribed_at = COALESCE(photo_notifications_unsubscribed_at, now()),
          updated_at = now()
      WHERE event_id = $1
        AND attendee_id = $2
    `,
    [input.eventId, input.attendeeId],
  );
}
