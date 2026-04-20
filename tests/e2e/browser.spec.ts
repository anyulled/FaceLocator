import { test, expect } from '@playwright/test';
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getDatabasePool } from "@/lib/aws/database";
import type { Pool } from "pg";
import { join } from "path";
import {
  createAwsClients,
  deleteFaceIfPresent,
  deleteS3ObjectIfPresent,
  E2E_EVENT_ID,
  E2E_SUCCESS_MESSAGE,
  getRekognitionCollectionId,
  getSelfiesBucketName,
  pollForQueryRow,
} from "./aws-test-helpers";

test.describe("Browser E2E AWS Integration", () => {
  const { s3, rekognition } = createAwsClients();
  let pool: Pool;
  const collectionId = getRekognitionCollectionId();
  const selfiesBucketName = getSelfiesBucketName();
  
  // Track resources to clean up
  let registrationId: string | undefined;
  let attendeeId: string | undefined;
  let objectKey: string | undefined;
  let faceId: string | undefined;

  test.beforeAll(async () => {
    pool = await getDatabasePool();
  });

  test.afterAll(async () => {
    // Cleanup any created AWS resources
    if (objectKey) {
      await deleteS3ObjectIfPresent({
        s3,
        bucket: selfiesBucketName,
        key: objectKey,
      }).catch(console.error);
    }
    
    if (faceId) {
      await deleteFaceIfPresent({
        rekognition,
        collectionId,
        faceId,
      }).catch(console.error);
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
    await page.goto(`/events/${E2E_EVENT_ID}/register`);

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
    const statusText = page.getByText(E2E_SUCCESS_MESSAGE);
    await expect(statusText).toBeVisible({ timeout: 45000 });

    // Grab the registrationId from the URL to verify backend
    const url = new URL(page.url());
    registrationId = url.searchParams.get('registrationId') || undefined;
    expect(registrationId, 'registrationId should be present in the URL').toBeTruthy();

    const dbRes = await pollForQueryRow<{
      status: string;
      selfie_object_key: string;
      attendee_id: string;
      rekognition_face_id: string;
      external_image_id: string;
    }>(
      pool,
      `SELECT * FROM face_enrollments WHERE registration_id = $1`,
      [registrationId],
      { rowDescription: "Timed out waiting for face enrollment" },
    );

    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].status).toBe("enrolled");
    
    objectKey = dbRes.rows[0].selfie_object_key;
    attendeeId = dbRes.rows[0].attendee_id;
    faceId = dbRes.rows[0].rekognition_face_id;
    
    expect(objectKey).toBeTruthy();
    expect(attendeeId).toBeTruthy();
    expect(faceId).toBeTruthy();
    expect(dbRes.rows[0].external_image_id).toBe(`${E2E_EVENT_ID}:${attendeeId}`);

    const headObj = await s3.send(
      new HeadObjectCommand({
        Bucket: selfiesBucketName,
        Key: objectKey!,
      })
    );
    expect(headObj.Metadata?.["registration-id"]).toBe(registrationId);
    expect(headObj.Metadata?.["event-id"]).toBe(E2E_EVENT_ID);
    expect(headObj.Metadata?.["attendee-id"]).toBe(attendeeId);
  });
});
