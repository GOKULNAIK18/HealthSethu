/** @type {import('next').NextConfig} */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://healthsethu.onrender.com'

const nextConfig = {
  serverExternalPackages: ['better-sqlite3', 'sharp'],
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
