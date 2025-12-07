import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/intercom/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "microphone=*, camera=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
