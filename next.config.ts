import type { NextConfig } from "next";

// Static files only. Apache serves them next to the PHP API.
// Redirects, rewrites, and headers live in public_html/.htaccess.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
