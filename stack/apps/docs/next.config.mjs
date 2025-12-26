import { createMDX } from 'fumadocs-mdx/next';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  transpilePackages: ['@workspace/ui'],
  typescript: {
    // Skip type checking during build - handled by tsconfig
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint during build
    ignoreDuringBuilds: true,
  },
};

const withMDX = createMDX();

export default withMDX(config);
