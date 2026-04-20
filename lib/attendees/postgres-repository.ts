import type {
  EnrollmentStatus,
  RegistrationIntentRequest,
  RegistrationIntentResponse,
  RegistrationStatusResponse,
} from "@/lib/attendees/contracts";
import { getEnrollmentStatusCopy } from "@/lib/attendees/copy";
import { createApiError } from "@/lib/attendees/errors";
import type { AttendeeRepository } from "@/lib/attendees/repository";
import type { UploadGateway } from "@/lib/attendees/upload-gateway";
import { getDatabasePool } from "@/lib/aws/database";
import { parseSelfieObjectKey } from "@/lib/aws/boundary";

function makeId(prefix: "reg" | "att" | "consent") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function resolveStatusMessage(status: EnrollmentStatus) {
  return getEnrollmentStatusCopy(status);
}

function mapDatabaseStatus(status: string | null | undefined): EnrollmentStatus {
  switch (status) {
    case "enrolled":
      return "ENROLLED";
    case "failed":
      return "FAILED";
    case "cancelled":
      return "CANCELLED";
    case "processing":
      return "PROCESSING";
    case "pending":
    default:
      return "UPLOAD_PENDING";
  }
}

function buildStatusResponse(
  registrationId: string,
  status: EnrollmentStatus,
): RegistrationStatusResponse {
  return {
    registrationId,
    status,
    message: resolveStatusMessage(status),
  };
}

type ExistingRegistrationRow = {
  registrationId: string;
  attendeeId: string;
  selfieObjectKey: string;
  status: string;
  consentVersion: string | null;
  consentText: string | null;
  consentGrantedAt: string | null;
};

export const postgresAttendeeRepository: AttendeeRepository = {
  async createRegistrationIntent(
    input: RegistrationIntentRequest,
    gateway: UploadGateway,
  ): Promise<RegistrationIntentResponse> {
    const pool = await getDatabasePool();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      if (input.submissionKey) {
        const existingRes = await client.query<ExistingRegistrationRow>(
          `
            SELECT
              fe.registration_id AS "registrationId",
              fe.attendee_id AS "attendeeId",
              fe.selfie_object_key AS "selfieObjectKey",
              fe.status,
              c.consent_text_version AS "consentVersion",
              c.consent_text AS "consentText",
              c.granted_at AS "consentGrantedAt"
            FROM face_enrollments fe
            LEFT JOIN event_attendees ea
              ON ea.event_id = fe.event_id
             AND ea.attendee_id = fe.attendee_id
            LEFT JOIN consents c
              ON c.id = ea.consent_id
            WHERE fe.submission_key = $1
              AND fe.deleted_at IS NULL
            ORDER BY fe.created_at DESC
            LIMIT 1
          `,
          [input.submissionKey],
        );

        const existing = existingRes.rows[0];
        if (existing) {
          const parsedObjectKey = parseSelfieObjectKey(existing.selfieObjectKey);
          const upload = await gateway.createUploadInstructions({
            registrationId: existing.registrationId,
            attendeeId: existing.attendeeId,
            eventSlug: input.eventSlug,
            fileName: parsedObjectKey?.fileName ?? input.fileName,
            contentType: input.contentType,
          });

          await client.query("COMMIT");

          return {
            registrationId: existing.registrationId,
            attendeeId: existing.attendeeId,
            upload,
            status: "UPLOAD_PENDING",
          };
        }
      }

      await client.query(
        `
          INSERT INTO events (id, slug, title)
          VALUES ($1, $1, $1)
          ON CONFLICT (id) DO NOTHING
        `,
        [input.eventSlug],
      );

      let attendeeId: string;
      const attendeeRes = await client.query<{ id: string }>(
        `SELECT id FROM attendees WHERE email = $1`,
        [input.email],
      );
      if (attendeeRes.rows.length > 0) {
        attendeeId = attendeeRes.rows[0].id;
        await client.query(`UPDATE attendees SET name = $2 WHERE id = $1`, [
          attendeeId,
          input.name,
        ]);
      } else {
        attendeeId = makeId("att");
        await client.query(
          `INSERT INTO attendees (id, email, name) VALUES ($1, $2, $3)`,
          [attendeeId, input.email, input.name],
        );
      }

      const consentId = makeId("consent");
      await client.query(
        `
          INSERT INTO consents (
            id,
            event_id,
            attendee_id,
            consent_text_version,
            consent_text,
            granted_at
          ) VALUES ($1, $2, $3, $4, $5, now())
        `,
        [
          consentId,
          input.eventSlug,
          attendeeId,
          "2026-04-19",
          "I consent to FaceLocator using my selfie for facial matching against event photos and for later delivery of matched photos.",
        ],
      );

      await client.query(
        `
          INSERT INTO event_attendees (event_id, attendee_id, consent_id, enrollment_status)
          VALUES ($1, $2, $3, 'pending')
          ON CONFLICT (event_id, attendee_id) DO UPDATE
          SET consent_id = EXCLUDED.consent_id,
              withdrawal_at = NULL,
              updated_at = now()
        `,
        [input.eventSlug, attendeeId, consentId],
      );

      const registrationId = makeId("reg");
      const upload = await gateway.createUploadInstructions({
        registrationId,
        attendeeId,
        eventSlug: input.eventSlug,
        fileName: input.fileName,
        contentType: input.contentType,
      });

      await client.query(
        `
          INSERT INTO face_enrollments (
            id,
            event_id,
            attendee_id,
            registration_id,
            submission_key,
            selfie_object_key,
            status
          ) VALUES (
            gen_random_uuid()::text,
            $1,
            $2,
            $3,
            $4,
            $5,
            'pending'
          )
        `,
        [
          input.eventSlug,
          attendeeId,
          registrationId,
          input.submissionKey ?? registrationId,
          upload.objectKey,
        ],
      );

      await client.query("COMMIT");

      return {
        registrationId,
        attendeeId,
        upload,
        status: "UPLOAD_PENDING",
      };
    } catch (error) {
      await client.query("ROLLBACK");

      if (
        input.submissionKey &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        const existingRes = await pool.query<ExistingRegistrationRow>(
          `
            SELECT
              registration_id AS "registrationId",
              attendee_id AS "attendeeId",
              selfie_object_key AS "selfieObjectKey",
              status,
              NULL AS "consentVersion",
              NULL AS "consentText",
              NULL AS "consentGrantedAt"
            FROM face_enrollments
            WHERE submission_key = $1
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [input.submissionKey],
        );

        const existing = existingRes.rows[0];
        if (existing) {
          const parsedObjectKey = parseSelfieObjectKey(existing.selfieObjectKey);
          const upload = await gateway.createUploadInstructions({
            registrationId: existing.registrationId,
            attendeeId: existing.attendeeId,
            eventSlug: input.eventSlug,
            fileName: parsedObjectKey?.fileName ?? input.fileName,
            contentType: input.contentType,
          });

          return {
            registrationId: existing.registrationId,
            attendeeId: existing.attendeeId,
            upload,
            status: "UPLOAD_PENDING",
          };
        }
      }

      throw error;
    } finally {
      client.release();
    }
  },

  async completeRegistration(
    registrationId: string,
    uploadCompletedAt: string,
  ): Promise<RegistrationStatusResponse> {
    void uploadCompletedAt;

    const pool = await getDatabasePool();
    const result = await pool.query<{ eventId: string; attendeeId: string }>(
      `
        UPDATE face_enrollments
        SET status = CASE
          WHEN status = 'enrolled' THEN status
          ELSE 'processing'
        END
        WHERE registration_id = $1
          AND deleted_at IS NULL
        RETURNING event_id AS "eventId", attendee_id AS "attendeeId"
      `,
      [registrationId],
    );

    const record = result.rows[0];
    if (!record) {
      throw createApiError(404, "REGISTRATION_NOT_FOUND", "Registration not found.");
    }

    await pool.query(
      `
        UPDATE event_attendees
        SET enrollment_status = 'processing', updated_at = now()
        WHERE event_id = $1
          AND attendee_id = $2
          AND enrollment_status <> 'enrolled'
      `,
      [record.eventId, record.attendeeId],
    );

    return buildStatusResponse(registrationId, "PROCESSING");
  },

  async getRegistrationStatus(registrationId: string): Promise<RegistrationStatusResponse> {
    const pool = await getDatabasePool();
    const res = await pool.query<{ status: string }>(
      `
        SELECT status
        FROM face_enrollments
        WHERE registration_id = $1
          AND deleted_at IS NULL
        ORDER BY
          CASE status
            WHEN 'enrolled' THEN 3
            WHEN 'processing' THEN 2
            WHEN 'pending' THEN 1
            ELSE 0
          END DESC,
          created_at DESC
        LIMIT 1
      `,
      [registrationId],
    );

    const record = res.rows[0];
    if (!record) {
      throw createApiError(404, "REGISTRATION_NOT_FOUND", "Registration not found.");
    }

    return buildStatusResponse(registrationId, mapDatabaseStatus(record.status));
  },
};
