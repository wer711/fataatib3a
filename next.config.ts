import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // IMPORTANT: Do NOT use "standalone" output for Vercel deployment.
  // Vercel handles Next.js builds natively. "standalone" is only for
  // self-hosted/Docker deployments (Railway, Render, DigitalOcean, etc.)
  // 
  // For Netlify: Use @netlify/plugin-nextjs (already in netlify.toml)
  // For Vercel: No output config needed (default is fine)
  // For Docker: Set output: "standalone" before building
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    ".space-z.ai",
    ".z.ai",
  ],
  // Increase server body size for file uploads (only used by /api/upload-file)
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
