import {
  getMatchedGalleryData,
  unsubscribeFromMatchedPhotoNotifications,
} from "@/lib/notifications/gallery";
import { verifySignedNotificationToken } from "@/lib/notifications/token";

type GalleryData = {
  attendeeName: string;
  photoUrls: string[];
};

export async function getMatchedGalleryDataViaBackend(input: {
  eventId: string;
  faceId: string;
  token: string;
}): Promise<GalleryData | null> {
  try {
    const tokenPayload = verifySignedNotificationToken(input.token, "gallery");
    if (!tokenPayload || tokenPayload.eventId !== input.eventId || tokenPayload.faceId !== input.faceId) {
      return null;
    }

    return await getMatchedGalleryData({
      eventId: input.eventId,
      attendeeId: tokenPayload.sub,
      faceId: input.faceId,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "notifications",
        level: "error",
        operation: "getGalleryPageData",
        backend: "direct",
        input,
        troubleshootingHint:
          "Check the notification signing secret, database access, and gallery query contract.",
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      }),
    );
    return null;
  }
}

export async function unsubscribeFromMatchedPhotoNotificationsViaBackend(input: {
  eventId: string;
  faceId: string;
  token: string;
}): Promise<boolean> {
  try {
    const tokenPayload = verifySignedNotificationToken(input.token, "unsubscribe");
    if (!tokenPayload || tokenPayload.eventId !== input.eventId || tokenPayload.faceId !== input.faceId) {
      return false;
    }

    await unsubscribeFromMatchedPhotoNotifications({
      eventId: tokenPayload.eventId,
      attendeeId: tokenPayload.sub,
    });

    return true;
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "notifications",
        level: "error",
        operation: "unsubscribeFromMatchedPhotos",
        backend: "direct",
        input,
        troubleshootingHint:
          "Check the notification signing secret, database access, and unsubscribe query contract.",
        error:
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) },
      }),
    );
    return false;
  }
}
