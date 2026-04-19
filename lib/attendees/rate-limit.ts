import type { RegistrationIntentRequest } from "@/lib/attendees/contracts";

export type RegistrationRateLimitDecision = {
  allowed: boolean;
  reason?: "placeholder_policy";
};

export function evaluateRegistrationRateLimit(
  request: Request,
  payload: RegistrationIntentRequest,
): RegistrationRateLimitDecision {
  void payload;
  const forcedMode =
    request.headers.get("x-facelocator-rate-limit") ??
    process.env.FACE_LOCATOR_RATE_LIMIT_MODE ??
    "off";

  if (forcedMode === "always") {
    return {
      allowed: false,
      reason: "placeholder_policy",
    };
  }

  return { allowed: true };
}
