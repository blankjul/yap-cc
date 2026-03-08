import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  distDir: '.next',
  devIndicators: {
    position: 'bottom-left',
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000"
    return [
      { source: '/api/:path*',   destination: `${backendUrl}/api/:path*` },
      { source: '/setup/:path*', destination: `${backendUrl}/setup/:path*` },
      { source: '/health',       destination: `${backendUrl}/health` },
    ]
  },
};

export default nextConfig;
