/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  async redirects() {
    const baseUrl = process.env.NEXTAUTH_URL
    if (!baseUrl) return []
    try {
      const u = new URL(baseUrl)
      if (u.hostname.startsWith("www.")) return []
      return [
        {
          source: "/:path*",
          has: [{ type: "host", value: "www." + u.hostname }],
          destination: u.origin + "/:path*",
          permanent: true,
        },
      ]
    } catch {
      return []
    }
  },
}

module.exports = nextConfig
