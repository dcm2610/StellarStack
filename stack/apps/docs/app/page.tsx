import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-3xl">
        <h1 className="mb-4 text-4xl font-bold">StellarStack Documentation</h1>
        <p className="mb-8 text-lg text-fd-muted-foreground">
          The open-source, self-hosted game server management panel.
          Deploy, manage, and scale game servers across your infrastructure.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-6 py-3 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
          >
            Get Started
          </Link>
          <Link
            href="/docs/architecture"
            className="rounded-lg border border-fd-border px-6 py-3 font-medium transition-colors hover:bg-fd-accent"
          >
            Architecture
          </Link>
        </div>
      </div>
    </main>
  );
}
