import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Server Actions default to a 1MB request body — well under the
      // 20MB file uploads this app allows (Timeline/project documents),
      // so those uploads were failing outright before reaching the
      // action's own size check. Some headroom above 20MB for
      // multipart/form-data's own boundary/field overhead.
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
