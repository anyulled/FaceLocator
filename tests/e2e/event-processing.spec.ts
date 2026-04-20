import { test, expect } from '@playwright/test';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { RekognitionClient, DeleteFacesCommand } from "@aws-sdk/client-rekognition";
import { getDatabasePool } from "@/lib/aws/database";
import type { Pool } from "pg";
import { join } from "path";
import { readFileSync } from "fs";

test.describe("Event Photo Processing E2E", () => {
  let s3: S3Client;
  let rekognition: RekognitionClient;
  let pool: Pool;
  
  const EVENT_ID = "speaker-session-2026";
  const ATTENDEE_EMAIL = `event-tester-${Date.now()}@example.com`;
  
  // Track resources for cleanup
  let registrationId: string | undefined;
  let attendeeId: string | undefined;
  let selfieKey: string | undefined;
  let faceId: string | undefined;
  const eventPhotoKeys: string[] = [];

  test.beforeAll(async () => {
    const region = process.env.AWS_REGION || "eu-west-1";
    s3 = new S3Client({ region });
    rekognition = new RekognitionClient({ region });
    pool = await getDatabasePool();

    // 1. Ensure the event exists in the database
    await pool.query(
      `INSERT INTO events (id, slug, title) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
      [EVENT_ID, EVENT_ID, "Speaker Session 2026"]
    );
  });

  test.afterAll(async () => {
    // Cleanup event photos
    for (const key of eventPhotoKeys) {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET!,
        Key: key,
      })).catch(console.error);
    }

    // Cleanup selfie
    if (selfieKey) {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.FACE_LOCATOR_SELFIES_BUCKET!,
        Key: selfieKey,
      })).catch(console.error);
    }

    // Cleanup Rekognition
    if (faceId) {
      await rekognition.send(new DeleteFacesCommand({
        CollectionId: "face-locator-poc-faces",
        FaceIds: [faceId],
      })).catch(console.error);
    }

    // Cleanup Database
    if (registrationId) {
      await pool.query(`DELETE FROM face_enrollments WHERE registration_id = $1`, [registrationId]);
    }
    if (attendeeId) {
      await pool.query(`DELETE FROM attendees WHERE id = $1`, [attendeeId]);
    }

    await pool.end();
  });

  test('should enroll an attendee and then find them in multiple event photos', async ({ page }) => {
    // --- STEP 1: ENROLLMENT (Prerequisite) ---
    await page.goto(`/events/${EVENT_ID}/register`);
    await page.fill('input#name', 'Event Test User');
    await page.fill('input#email', ATTENDEE_EMAIL);
    await page.locator('input#selfie').setInputFiles(join(process.cwd(), "public", "100741.jpeg"));
    await page.check('input#consentAccepted');
    await page.click('button[type="submit"]');

    await expect(page.getByText(/Your selfie has been registered/i)).toBeVisible({ timeout: 45000 });
    
    const url = new URL(page.url());
    registrationId = url.searchParams.get('registrationId')!;
    
    // Get backend IDs for verification and cleanup
    const dbRes = await pool.query(`SELECT attendee_id, selfie_object_key, rekognition_face_id FROM face_enrollments WHERE registration_id = $1`, [registrationId]);
    attendeeId = dbRes.rows[0].attendee_id;
    selfieKey = dbRes.rows[0].selfie_object_key;
    faceId = dbRes.rows[0].rekognition_face_id;

    console.log(`Attendee ${attendeeId} enrolled with FaceId ${faceId}`);

    // --- STEP 2: EVENT PHOTO UPLOAD ---
    // We'll upload multiple images. 
    // IMPORTANT: For the test to definitely find a match, we'll upload the SAME image (100741.jpeg) as an event photo.
    // Plus some other ones from the public folder.
    const photosToUpload = [
      { name: "match-photo.jpg", path: "public/100741.jpeg" }, // Guaranteed match
      { name: "event-photo-1.jpg", path: "public/1000065600.jpg" },
      { name: "event-photo-2.jpg", path: "public/1000065602.jpg" },
    ];

    for (const photo of photosToUpload) {
      const key = `events/pending/${EVENT_ID}/photos/${photo.name}`;
      eventPhotoKeys.push(key);
      
      console.log(`Uploading event photo: ${key}`);
      await s3.send(new PutObjectCommand({
        Bucket: process.env.FACE_LOCATOR_EVENT_PHOTOS_BUCKET!,
        Key: key,
        Body: readFileSync(join(process.cwd(), photo.path)),
        ContentType: "image/jpeg",
        Metadata: {
          "event-id": EVENT_ID,
          "photo-id": photo.name.split('.')[0],
        }
      }));
    }

    // --- STEP 3: VERIFY RECOGNITION AND MATCHES ---
    console.log("Waiting for Lambda to process event photos...");
    
    // Poll for the guaranteed match in RDS
    let matchFound = false;
    let attempts = 0;
    const maxAttempts = 20;
    while (!matchFound && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 3000));
      const matchRes = await pool.query(
        `SELECT m.*, p.object_key 
         FROM photo_face_matches m
         JOIN event_photos p ON m.event_photo_id = p.id
         WHERE m.attendee_id = $1 AND p.event_id = $2`,
        [attendeeId, EVENT_ID]
      );
      
      if (matchRes.rows.length > 0) {
        console.log(`Found ${matchRes.rows.length} matches for attendee!`);
        for (const row of matchRes.rows) {
          console.log(`- Match in ${row.object_key} with similarity ${row.similarity}%`);
        }
        matchFound = true;
      }
      attempts++;
    }

    expect(matchFound, "Should have found at least one face match in the database").toBe(true);
  }, 90000); // 90 seconds timeout
});
