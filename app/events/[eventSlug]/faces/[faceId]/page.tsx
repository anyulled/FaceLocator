import React from "react";
import Image from "next/image";
import { notFound } from "next/navigation";

import { getMatchedGalleryData } from "@/lib/notifications/gallery";
import { verifySignedNotificationToken } from "@/lib/notifications/token";

type MatchedGalleryPageProps = {
  params: Promise<{
    eventSlug: string;
    faceId: string;
  }>;
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function MatchedGalleryPage({
  params,
  searchParams,
}: MatchedGalleryPageProps) {
  const { eventSlug, faceId } = await params;
  const { token } = await searchParams;

  if (!token) {
    notFound();
  }

  const payload = verifySignedNotificationToken(token, "gallery");
  if (!payload || payload.eventId !== eventSlug || payload.faceId !== faceId) {
    notFound();
  }

  const galleryData = await getMatchedGalleryData({
    eventId: eventSlug,
    attendeeId: payload.sub,
    faceId,
  });

  if (!galleryData) {
    notFound();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "1.5rem",
      }}
    >
      <div
        style={{
          maxWidth: "72rem",
          margin: "0 auto",
          display: "grid",
          gap: "1.25rem",
        }}
      >
        <Image
          src="/devbcn-logo.svg"
          alt="Event logo"
          width={280}
          height={112}
          style={{
            width: "100%",
            maxWidth: "17rem",
            height: "auto",
          }}
        />
        <p
          style={{
            margin: 0,
            fontSize: "1.2rem",
            fontWeight: 700,
          }}
        >
          {galleryData.attendeeName}
        </p>

        <section
          style={{
            columnWidth: "16rem",
            columnGap: "1rem",
          }}
        >
          {galleryData.photoUrls.map((photoUrl) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photoUrl}
              src={photoUrl}
              alt=""
              style={{
                width: "100%",
                height: "auto",
                borderRadius: "0.75rem",
                marginBottom: "1rem",
                breakInside: "avoid",
                border: "1px solid var(--border)",
              }}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
