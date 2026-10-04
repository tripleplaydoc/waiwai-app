/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Receipt uploads ride along with server actions (files are capped at 4 MB).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
};

module.exports = nextConfig;
