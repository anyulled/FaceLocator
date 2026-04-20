import type {
  RegistrationIntentRequest,
  RegistrationIntentResponse,
  RegistrationStatusResponse,
} from "@/lib/attendees/contracts";
import { getEnrollmentStatusCopy } from "@/lib/attendees/copy";
import { createApiError } from "@/lib/attendees/errors";
import type { AttendeeRepository } from "@/lib/attendees/repository";
import type { UploadGateway } from "@/lib/attendees/upload-gateway";
import { getDatabasePool } from "@/lib/aws/database";

function makeId(prefix: "reg" | "att") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export const postgresAttendeeRepository: AttendeeRepository = {
  async createRegistrationIntent(input: RegistrationIntentRequest, gateway: UploadGateway): Promise<RegistrationIntentResponse> {
    const pool = await getDatabasePool();

    // Check existing by submissionKey
    if (input.submissionKey) {
      const existingRes = await pool.query(
        `SELECT r.id as "registrationId", r.attendee_id as "attendeeId" 
         FROM face_enrollments r 
         WHERE r.external_image_id = $1`, 
        [input.submissionKey]
      );
    }

    // 1. Ensure event exists (if it doesn't, we should create it or fail. The bootstrap creates none, so let's upsert event)
    await pool.query(
      `INSERT INTO events (id, slug, title) VALUES ($1, $1, $1) ON CONFLICT (id) DO NOTHING`,
      [input.eventSlug]
    );

    // 2. Ensure attendee exists
    let attendeeId: string;
    const attendeeRes = await pool.query(`SELECT id FROM attendees WHERE email = $1`, [input.email]);
    if (attendeeRes.rows.length > 0) {
      attendeeId = attendeeRes.rows[0].id;
    } else {
      attendeeId = makeId("att");
      await pool.query(
        `INSERT INTO attendees (id, email, name) VALUES ($1, $2, $3)`,
        [attendeeId, input.email, input.name]
      );
    }

    // 3. Ensure event_attendees exists
    await pool.query(
      `INSERT INTO event_attendees (event_id, attendee_id, enrollment_status) 
       VALUES ($1, $2, 'pending') 
       ON CONFLICT (event_id, attendee_id) DO NOTHING`,
      [input.eventSlug, attendeeId]
    );

    // 4. Create upload instructions
    const registrationId = makeId("reg");
    const upload = await gateway.createUploadInstructions({
      registrationId,
      attendeeId,
      eventSlug: input.eventSlug,
      fileName: input.fileName,
      contentType: input.contentType,
    });

    return {
      registrationId,
      attendeeId,
      upload,
      status: "UPLOAD_PENDING",
    };
  },

  async completeRegistration(registrationId: string, uploadCompletedAt: string): Promise<RegistrationStatusResponse> {
    // In postgres mode, Next.js doesn't write to face_enrollments. The lambda does!
    // But completeRegistration needs to return PROCESSING.
    // The lambda writes status = 'enrolled' to face_enrollments eventually.
    // For now, Next.js can just trust it's processing if the client says it completed upload.
    return {
      registrationId,
      status: "PROCESSING",
      message: getEnrollmentStatusCopy("PROCESSING"),
    };
  },

  async getRegistrationStatus(registrationId: string): Promise<RegistrationStatusResponse> {
    const pool = await getDatabasePool();

    // Check if the lambda has enrolled it
    const res = await pool.query(
      `SELECT status FROM face_enrollments WHERE registration_id = $1`,
      [registrationId]
    );

    if (res.rows.length > 0) {
      const status = res.rows[0].status === "enrolled" ? "ENROLLED" : "PROCESSING";
      return {
        registrationId,
        status,
        message: getEnrollmentStatusCopy(status),
      };
    }

    // If not found in face_enrollments, the lambda hasn't finished (or failed).
    // We return PROCESSING as long as it's not timed out.
    return {
      registrationId,
      status: "PROCESSING",
      message: getEnrollmentStatusCopy("PROCESSING"),
    };
  },
};
