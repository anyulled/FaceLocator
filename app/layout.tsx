import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FaceLocator Enrollment",
  description: "Scaffolded attendee enrollment flow for event photography.",
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
