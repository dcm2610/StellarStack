import { execSync } from "child_process";

const getGitCommitHash = () => {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Required for Railway/Docker deployments
  reactStrictMode: false, // Disable to prevent double WebSocket connections in dev
  transpilePackages: ["@workspace/ui"],
  env: {
    NEXT_PUBLIC_GIT_COMMIT_HASH: getGitCommitHash(),
  },
}

export default nextConfig
