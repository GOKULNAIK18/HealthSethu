/** @type {import('next').NextConfig} */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3', 'sharp'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_BASE}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${API_BASE}/uploads/:path*`,
      },
    ]
  },
}
module.exports = nextConfig
