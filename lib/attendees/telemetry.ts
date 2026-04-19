type TelemetryEventName =
  | "enrollment_form_viewed"
  | "enrollment_file_selected"
  | "enrollment_submit_clicked"
  | "enrollment_registration_created"
  | "enrollment_upload_started"
  | "enrollment_upload_succeeded"
  | "enrollment_processing_seen"
  | "enrollment_completed"
  | "enrollment_failed";

export function trackEnrollmentEvent(
  _eventName: TelemetryEventName,
  _payload?: Record<string, string>,
) {
  void _eventName;
  void _payload;
  return;
}
