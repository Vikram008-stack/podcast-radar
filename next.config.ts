import type { NextConfig } from "next";

// Every page is private, per-user and data-driven, so pages render dynamically
// (cacheComponents off). Security headers apply to all routes.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // ship the ffmpeg binary with the serverless functions that run the pipeline
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/cron/daily": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/jobs/run": ["./node_modules/ffmpeg-static/ffmpeg*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
