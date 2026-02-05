/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: "/internal-app",
  assetPrefix: "/internal-app/",
  reactStrictMode: true,
};

export default nextConfig;
