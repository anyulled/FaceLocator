import { test, expect } from '@playwright/test';
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { RekognitionClient, DeleteFacesCommand } from "@aws-sdk/client-rekognition";
import { getDatabasePool } from "@/lib/aws/database";
import type { Pool } from "pg";
import { join } from "path";

test.describe("Browser E2E AWS Integration", () => {
  let s3: S3Client;
  let rekognition: RekognitionClient;
  let pool: Pool;
  
  // Track resources to clean up
  let registrationId: string | undefined;
  let attendeeId: string | undefined;
  let objectKey: string | undefined;
  let faceId: string | undefined;

  test.beforeAll(async () => {
    const region = process.env.AWS_REGION || "eu-west-1";
    s3 = new S3Client({ region });
    rekognition = new RekognitionClient({ region });
    pool = await getDatabasePool();
  });

  test.afterAll(async () => {
    // Cleanup any created AWS resources
    if (objectKey) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.FACE_LOCATOR_SELFIES_BUCKET!,
          Key: objectKey,
        })
      ).catch(console.error);
    }
    
    if (faceId) {
      await rekognition.send(
        new DeleteFacesCommand({
          CollectionId: "face-locator-poc-faces",
          FaceIds: [faceId],
        })
      ).catch(console.error);
    }

    if (registrationId) {
      await pool.query(`DELETE FROM face_enrollments WHERE registration_id = $1`, [registrationId]).catch(console.error);
    }

    if (attendeeId) {
      await pool.query(`DELETE FROM attendees WHERE id = $1`, [attendeeId]).catch(console.error);
    }

    await pool.end();
  });

  test('should complete the full enrollment lifecycle via UI', async ({ page }) => {
    // Navigate to the registration page
    await page.goto('/events/speaker-session-2026/register');

    // Fill out the form
    await page.fill('input#name', 'Browser E2E Test User');
    await page.fill('input#email', `browser-e2e-${Date.now()}@example.com`);

    // Upload the file
    const fileInput = page.locator('input#selfie');
    await fileInput.setInputFiles(join(process.cwd(), "public", "100741.jpeg"));

    // Check the consent checkbox
    await page.check('input#consentAccepted');

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for the success message to appear (this might take up to 20-30 seconds depending on AWS lambdas)
    // The AttendeeEnrollmentStatus component shows status updates. When enrolled, the state is ENROLLED.
    // The success message usually contains the word "enrolled" or is specific.
    // The exact message is "Enrollment complete. You're ready to be matched with event photos."
    const statusText = page.getByText(/Your selfie has been registered/i);
    await expect(statusText).toBeVisible({ timeout: 45000 });

    // Grab the registrationId from the URL to verify backend
    // Format: /events/speaker-session-2026/register?registrationId=reg_abc123
    const url = new URL(page.url());
    registrationId = url.searchParams.get('registrationId') || undefined;
    expect(registrationId, 'registrationId should be present in the URL').toBeTruthy();

    // Verify Backend Direct State

    // 1. Database Verification
    const dbRes = await pool.query(
      `SELECT * FROM face_enrollments WHERE registration_id = $1`,
      [registrationId]
    );
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].status).toBe("enrolled");
    
    objectKey = dbRes.rows[0].selfie_object_key;
    attendeeId = dbRes.rows[0].attendee_id;
    faceId = dbRes.rows[0].rekognition_face_id;
    
    expect(objectKey).toBeTruthy();
    expect(attendeeId).toBeTruthy();
    expect(faceId).toBeTruthy();

    // 2. S3 Verification
    const headObj = await s3.send(
      new HeadObjectCommand({
        Bucket: process.env.FACE_LOCATOR_SELFIES_BUCKET!,
        Key: objectKey!,
      })
    );
    expect(headObj.Metadata?.["registration-id"]).toBe(registrationId);
  });
});
