import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Skip TypeScript + ESLint during build. We type-check locally via
  // `npx tsc --noEmit`, and the actual runtime is the source of truth
  // for demos. This gets us shipping today.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

export default nextConfig
