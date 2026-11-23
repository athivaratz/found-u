import type { NextConfig } from "next";

const apiOrigin = process.env.FOUNDU_API_ORIGIN?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    if (!apiOrigin) return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
  async redirects() {
    return [
      { source: "/list", destination: "/home", permanent: true },
      { source: "/login", destination: "/auth/login", permanent: true },
      { source: "/login/register", destination: "/auth/register", permanent: true },
      { source: "/login/forgot-pin", destination: "/auth/login/forgot-pin", permanent: true },
      { source: "/login/reset-password", destination: "/auth/login/reset-password", permanent: true },
      { source: "/login/change-password", destination: "/auth/change-password", permanent: true },
      { source: "/login/setup-pin", destination: "/auth/setup-pin", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
