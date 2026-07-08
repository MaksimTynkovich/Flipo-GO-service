const path = require("path");
const dotenv = require("dotenv");

// Load only NEXT_PUBLIC_* from root .env — avoid PORT/API_PORT leaking into Next.js
const { parsed } = dotenv.config({ path: path.resolve(__dirname, "../../.env") });
if (parsed) {
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith("NEXT_PUBLIC_")) {
      process.env[key] = value;
    }
  }
}

const apiUpstream = process.env.API_UPSTREAM || "http://127.0.0.1:8080";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${apiUpstream}/api/v1/:path*` },
      { source: "/health", destination: `${apiUpstream}/health` },
      { source: "/ready", destination: `${apiUpstream}/ready` },
      { source: "/ws/:path*", destination: `${apiUpstream}/ws/:path*` },
    ];
  },
};

module.exports = nextConfig;
