/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Receipt uploads ride along with server actions (files are capped at 4 MB).
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      ],
    }];
  },
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

module.exports = nextConfig;
