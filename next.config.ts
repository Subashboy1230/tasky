import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Butterbase deployment target
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

export default nextConfig
