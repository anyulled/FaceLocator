import React from "react";
import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getMatchedGalleryDataViaBackend } from "@/lib/notifications/backend";
import { titleFromSlug } from "@/lib/page-metadata";

type MatchedGalleryPageProps = {
  params: Promise<{
    eventSlug: string;
    faceId: string;
  }>;
  searchParams: Promise<{
    token?: string;
  }>;
};

export async function generateMetadata({
  params,
}: Pick<MatchedGalleryPageProps, "params">): Promise<Metadata> {
  const { eventSlug } = await params;
  const eventTitle = titleFromSlug(eventSlug);

  return {
    title: `${eventTitle} matched photos`,
    description: `View your matched photos from ${eventTitle}.`,
  };
}

export default async function MatchedGalleryPage({
  params,
  searchParams,
}: MatchedGalleryPageProps) {
  const { eventSlug, faceId } = await params;
  const { token } = await searchParams;

  if (!token) {
    notFound();
  }

  const galleryData = await getMatchedGalleryDataViaBackend({
    eventId: eventSlug,
    faceId,
    token,
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
            <Image
              key={photoUrl}
              src={photoUrl}
              alt=""
              width={1200}
              height={900}
              sizes="(max-width: 768px) 100vw, 33vw"
              unoptimized
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
