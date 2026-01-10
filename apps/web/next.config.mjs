import { execSync } from "child_process";

const getGitCommitHash = () => {
  // Use env var if set (for Docker builds), otherwise try git
  if (process.env.NEXT_PUBLIC_GIT_COMMIT_HASH && process.env.NEXT_PUBLIC_GIT_COMMIT_HASH !== "unknown") {
    return process.env.NEXT_PUBLIC_GIT_COMMIT_HASH;
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disable to prevent double WebSocket connections in dev
  transpilePackages: ["@workspace/ui"],
  env: {
    NEXT_PUBLIC_GIT_COMMIT_HASH: getGitCommitHash(),
  },
}

export default nextConfig
