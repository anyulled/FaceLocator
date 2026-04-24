import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FaceLocator | Instant Event Photo Discovery",
    template: "%s | FaceLocator",
  },
  description: "Help attendees find event photos in seconds with private, face-based matching.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
