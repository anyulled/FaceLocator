import { inMemoryAttendeeRepository } from "@/lib/attendees/repository";
import { postgresAttendeeRepository } from "@/lib/attendees/postgres-repository";
import { createUploadGatewayFromEnv } from "@/lib/attendees/upload-gateway";

export function getAttendeeRepository() {
  if (process.env.FACE_LOCATOR_REPOSITORY_TYPE === "postgres") {
    return postgresAttendeeRepository;
  }
  return inMemoryAttendeeRepository;
}

export function getUploadGateway() {
  return createUploadGatewayFromEnv();
}
