import type { NextConfig } from "next"
const isProd = process.env.NODE_ENV === "production"
const repo = "genlayer-dashboard-v2"
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: isProd ? "/" + repo : "",
  assetPrefix: isProd ? "/" + repo + "/" : "",
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false, net: false, tls: false }
    return config
  },
}
export default nextConfig
