import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'StellarStack',
    },
    links: [
      {
        text: 'Dashboard',
        url: 'http://localhost:3000',
      },
      {
        text: 'Home',
        url: 'http://localhost:3002',
      },
    ],
    githubUrl: 'https://github.com/yourusername/stellarstack',
  };
}
