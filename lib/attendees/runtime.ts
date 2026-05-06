import { inMemoryAttendeeRepository } from "@/lib/attendees/repository";
import { postgresAttendeeRepository } from "@/lib/attendees/postgres-repository";
import { createUploadGatewayFromEnv } from "@/lib/attendees/upload-gateway";

export function getAttendeeRepository() {
  const repositoryType = (process.env.FACE_LOCATOR_REPOSITORY_TYPE || "").trim().toLowerCase();
  if (repositoryType === "memory" || repositoryType === "in-memory") {
    return inMemoryAttendeeRepository;
  }

  return postgresAttendeeRepository;
}

export function getUploadGateway() {
  return createUploadGatewayFromEnv();
}
