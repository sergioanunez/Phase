const nextPwa = require("@ducanh2912/next-pwa")

// Keep next-pwa's application-shell and static-asset strategies, but never put
// authenticated API responses in origin-wide Cache Storage.
const runtimeCachingWithoutApis = nextPwa.runtimeCaching.filter(
  (entry) => entry.options?.cacheName !== "apis"
)
const runtimeCaching = [
  {
    urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"),
    handler: "NetworkOnly",
    method: "GET",
  },
  ...runtimeCachingWithoutApis,
]

const withPWA = nextPwa.default({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  /** Prepends worker/index.js for push + notification click handling */
  customWorkerSrc: "worker",
  workboxOptions: {
    runtimeCaching,
  },
})

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

module.exports = withPWA(nextConfig)
