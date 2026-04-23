import { test, expect } from '@playwright/test';
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { Pool } from "pg";
import { join } from "path";
import { readFileSync } from "fs";
import {
  checkLiveE2EPrerequisites,
  createAwsClients,
  deleteFaceIfPresent,
  deleteS3ObjectIfPresent,
  E2E_EVENT_ID,
  E2E_SUCCESS_MESSAGE,
  getEventPhotosBucketName,
  getRekognitionCollectionId,
  getSelfiesBucketName,
  pollForQueryRow,
} from "./aws-test-helpers";

test.describe("Event Photo Processing E2E", () => {
  const { s3, rekognition } = createAwsClients();
  let pool: Pool | null = null;
  let skipReason = "";
  const collectionId = getRekognitionCollectionId();
  const selfiesBucketName = getSelfiesBucketName();
  const eventPhotosBucketName = getEventPhotosBucketName();
  const ATTENDEE_EMAIL = `event-tester-${Date.now()}@example.com`;
  
  // Track resources for cleanup
  let registrationId: string | undefined;
  let attendeeId: string | undefined;
  let selfieKey: string | undefined;
  let faceId: string | undefined;
  const eventPhotoIds: string[] = [];
  const eventPhotoKeys: string[] = [];

  test.beforeAll(async () => {
    const prerequisites = await checkLiveE2EPrerequisites({ requireDatabase: true });
    if (!prerequisites.ok) {
      skipReason = prerequisites.reason;
      console.warn(skipReason);
      return;
    }

    const dbPool = prerequisites.pool;
    pool = dbPool;

    // 1. Ensure the event exists in the database
    await dbPool.query(
      `INSERT INTO events (id, slug, title) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [E2E_EVENT_ID, E2E_EVENT_ID, "Speaker Session 2026"]
    );
  });

  test.afterAll(async () => {
    if (!pool) {
      return;
    }

    for (const key of eventPhotoKeys) {
      await deleteS3ObjectIfPresent({
        s3,
        bucket: eventPhotosBucketName,
        key,
      }).catch(console.error);
    }

    if (selfieKey) {
      await deleteS3ObjectIfPresent({
        s3,
        bucket: selfiesBucketName,
        key: selfieKey,
      }).catch(console.error);
    }

    if (faceId) {
      await deleteFaceIfPresent({
        rekognition,
        collectionId,
        faceId,
      }).catch(console.error);
    }

    if (eventPhotoIds.length > 0) {
      await pool.query(`DELETE FROM event_photos WHERE id = ANY($1::text[])`, [eventPhotoIds]).catch(console.error);
    }
    if (registrationId) {
      await pool.query(`DELETE FROM face_enrollments WHERE registration_id = $1`, [registrationId]).catch(console.error);
    }
    if (attendeeId) {
      await pool.query(`DELETE FROM attendees WHERE id = $1`, [attendeeId]).catch(console.error);
    }

    await pool.end();
  });

  test('should enroll an attendee and then find them in multiple event photos', async ({ page }) => {
    test.skip(Boolean(skipReason), skipReason);
    if (!pool) {
      test.fail(true, "Database pool should be available for live event-processing assertions.");
      return;
    }

    test.setTimeout(90000);

    // --- STEP 1: ENROLLMENT (Prerequisite) ---
    await page.goto(`/events/${E2E_EVENT_ID}/register`);
    await page.fill('input#name', 'Event Test User');
    await page.fill('input#email', ATTENDEE_EMAIL);
    await page.locator('input#selfie').setInputFiles(join(process.cwd(), "public", "100741.jpeg"));
    await page.check('input#consentAccepted');
    await page.click('button[type="submit"]');

    await expect(page.getByText(E2E_SUCCESS_MESSAGE)).toBeVisible({ timeout: 45000 });
    
    const url = new URL(page.url());
    registrationId = url.searchParams.get('registrationId')!;
    
    const dbRes = await pollForQueryRow<{
      attendee_id: string;
      selfie_object_key: string;
      rekognition_face_id: string;
      external_image_id: string;
    }>(
      pool,
      `SELECT attendee_id, selfie_object_key, rekognition_face_id, external_image_id
       FROM face_enrollments
       WHERE registration_id = $1`,
      [registrationId],
      { rowDescription: "Timed out waiting for enrollment before photo processing" },
    );

    attendeeId = dbRes.rows[0].attendee_id;
    selfieKey = dbRes.rows[0].selfie_object_key;
    faceId = dbRes.rows[0].rekognition_face_id;
    expect(dbRes.rows[0].external_image_id).toBe(`${E2E_EVENT_ID}:${attendeeId}`);

    console.log(`Attendee ${attendeeId} enrolled with FaceId ${faceId}`);

    // --- STEP 2: EVENT PHOTO UPLOAD ---
    const suffix = Date.now().toString();
    const photosToUpload = [
      { photoId: `match-photo-${suffix}`, fileName: `match-photo-${suffix}.jpg`, path: "public/100741.jpeg" },
      { photoId: `event-photo-1-${suffix}`, fileName: `event-photo-1-${suffix}.jpg`, path: "public/1000065600.jpg" },
      { photoId: `event-photo-2-${suffix}`, fileName: `event-photo-2-${suffix}.jpg`, path: "public/1000065602.jpg" },
    ];

    for (const photo of photosToUpload) {
      const key = `events/pending/${E2E_EVENT_ID}/photos/${photo.fileName}`;
      eventPhotoIds.push(photo.photoId);
      eventPhotoKeys.push(key);
      
      console.log(`Uploading event photo: ${key}`);
      await s3.send(new PutObjectCommand({
        Bucket: eventPhotosBucketName,
        Key: key,
        Body: readFileSync(join(process.cwd(), photo.path)),
        ContentType: "image/jpeg",
        Metadata: {
          "event-id": E2E_EVENT_ID,
          "photo-id": photo.photoId,
          "uploaded-by": "playwright-e2e",
        }
      }));
    }

    // --- STEP 3: VERIFY RECOGNITION AND MATCHES ---
    console.log("Waiting for Lambda to process event photos...");

    const eventPhotoRes = await pollForQueryRow<{
      id: string;
      object_key: string;
      status: string;
    }>(
      pool,
      `SELECT id, object_key, status
       FROM event_photos
       WHERE event_id = $1 AND id = ANY($2::text[])`,
      [E2E_EVENT_ID, eventPhotoIds],
      {
        rowDescription: "Timed out waiting for event photo rows",
        accept: (result) => result.rows.length === eventPhotoIds.length,
      },
    );

    expect(eventPhotoRes.rows.length).toBe(eventPhotoIds.length);
    for (const row of eventPhotoRes.rows) {
      expect(eventPhotoKeys).toContain(row.object_key);
    }

    const matchedPhoto = eventPhotoRes.rows.find((row) => row.id === photosToUpload[0].photoId);
    expect(matchedPhoto?.status).toBe("matches_found");

    const matchRes = await pollForQueryRow<{
      similarity: string;
      object_key: string;
      event_photo_id: string;
      attendee_id: string;
    }>(
      pool,
      `SELECT m.similarity, p.object_key, p.id as event_photo_id, m.attendee_id
       FROM photo_face_matches m
       JOIN event_photos p ON m.event_photo_id = p.id
       WHERE m.attendee_id = $1
         AND p.event_id = $2
         AND p.id = ANY($3::text[])`,
      [attendeeId, E2E_EVENT_ID, eventPhotoIds],
      { rowDescription: "Timed out waiting for attendee photo matches" },
    );

    expect(matchRes.rows.length).toBeGreaterThan(0);
    expect(matchRes.rows.some((row) => row.event_photo_id === photosToUpload[0].photoId)).toBe(true);
    for (const row of matchRes.rows) {
      expect(Number(row.similarity)).toBeGreaterThanOrEqual(90);
      expect(eventPhotoKeys).toContain(row.object_key);
    }
  });
});
