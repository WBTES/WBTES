/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async redirects() {
    return [
      {
        source: "/department/:path*",
        destination: "/hr/:path*",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
