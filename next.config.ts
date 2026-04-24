import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "face-locator-poc-event-photos.s3.eu-west-1.amazonaws.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
