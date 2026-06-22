const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  /** Prepends worker/index.js for push + notification click handling */
  customWorkerSrc: "worker",
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["sharp"],
    /** Prevent trace collector stack overflow from sharp's per-platform optional deps. */
    outputFileTracingExcludes: {
      "*": [
        "node_modules/@img/sharp-darwin-x64/**",
        "node_modules/@img/sharp-darwin-arm64/**",
        "node_modules/@img/sharp-win32-x64/**",
        "node_modules/@img/sharp-win32-ia32/**",
        "node_modules/@img/sharp-libvips-darwin-x64/**",
        "node_modules/@img/sharp-libvips-darwin-arm64/**",
        "node_modules/@img/sharp-libvips-win32-x64/**",
      ],
    },
  },
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
