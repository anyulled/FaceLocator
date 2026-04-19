import { inMemoryAttendeeRepository } from "@/lib/attendees/repository";
import { createUploadGatewayFromEnv } from "@/lib/attendees/upload-gateway";

export function getAttendeeRepository() {
  return inMemoryAttendeeRepository;
}

export function getUploadGateway() {
  return createUploadGatewayFromEnv();
}
