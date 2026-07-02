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

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

module.exports = nextConfig;
