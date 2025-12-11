"use client";

import { useState, useEffect, useRef, type JSX } from "react";
import Link from "next/link";
import { useTheme as useNextTheme } from "next-themes";
import { motion, useInView } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/shared/AnimatedBackground";
import { FloatingDots } from "@workspace/ui/components/shared/Animations";
import {
  BsSun,
  BsMoon,
  BsGithub,
  BsArrowRight,
  BsHeart,
  BsCode,
  BsGlobe,
  BsShieldCheck,
} from "react-icons/bs";
import { Footer } from "@/components/Footer";

const values = [
  {
    icon: BsCode,
    title: "Open Source First",
    description: "We believe in transparency and community-driven development. Every line of code is open for inspection, contribution, and improvement.",
  },
  {
    icon: BsHeart,
    title: "Community Driven",
    description: "Built by gamers, for gamers. Our roadmap is shaped by the community, and we actively listen to feedback from server administrators worldwide.",
  },
  {
    icon: BsGlobe,
    title: "Self-Hosted Freedom",
    description: "Your data, your servers, your rules. We provide the tools, you maintain full control over your infrastructure.",
  },
  {
    icon: BsShieldCheck,
    title: "Security by Design",
    description: "Enterprise-grade security isn't optional. From mTLS to encrypted storage, security is baked into every layer of StellarStack.",
  },
];

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

// Animated section wrapper
const AnimatedSection = ({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInUp}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const AboutPage = (): JSX.Element | null => {
  const { setTheme, resolvedTheme } = useNextTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  if (!mounted) return null;

  return (
    <div className={cn(
      "min-h-svh transition-colors relative",
      isDark ? "bg-[#0b0b0a]" : "bg-[#f5f5f4]"
    )}>
      <AnimatedBackground isDark={isDark} />
      <FloatingDots isDark={isDark} count={20} />

      {/* Navigation */}
      <nav className={cn(
        "fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-md",
        isDark
          ? "bg-[#0b0b0a]/80 border-zinc-800"
          : "bg-[#f5f5f4]/80 border-zinc-200"
      )}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className={cn(
            "text-lg font-light tracking-[0.2em]",
            isDark ? "text-zinc-100" : "text-zinc-800"
          )}>
            STELLARSTACK
          </Link>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-6">
              <Link href="/features" className={cn(
                "text-xs uppercase tracking-wider transition-colors",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )}>
                Features
              </Link>
              <Link href="/roadmap" className={cn(
                "text-xs uppercase tracking-wider transition-colors",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )}>
                Roadmap
              </Link>
              <Link href="/changelog" className={cn(
                "text-xs uppercase tracking-wider transition-colors",
                isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
              )}>
                Changelog
              </Link>
              <a
                href="https://github.com/stellarstack/stellarstack"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "text-xs uppercase tracking-wider transition-colors flex items-center gap-2",
                  isDark ? "text-zinc-400 hover:text-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                )}
              >
                <BsGithub className="w-4 h-4" />
                GitHub
              </a>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={cn(
                "transition-all hover:scale-110 active:scale-95 p-2",
                isDark
                  ? "border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
                  : "border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:border-zinc-400"
              )}
            >
              {isDark ? <BsSun className="w-4 h-4" /> : <BsMoon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className={cn(
                "text-4xl md:text-6xl font-extralight tracking-tight mb-6",
                isDark ? "text-zinc-100" : "text-zinc-900"
              )}
            >
              About StellarStack
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className={cn(
                "text-lg md:text-xl max-w-2xl mx-auto leading-relaxed",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}
            >
              We&apos;re building the future of self-hosted game server management. Open source, community-driven, and designed for the modern era.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="relative py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection>
            <div className={cn(
              "relative p-8 md:p-12 border",
              isDark ? "border-zinc-800 bg-zinc-900/30" : "border-zinc-200 bg-white"
            )}>
              {/* Corner decorations */}
              <div className={cn("absolute top-0 left-0 w-4 h-4 border-t border-l", isDark ? "border-zinc-600" : "border-zinc-400")} />
              <div className={cn("absolute top-0 right-0 w-4 h-4 border-t border-r", isDark ? "border-zinc-600" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 left-0 w-4 h-4 border-b border-l", isDark ? "border-zinc-600" : "border-zinc-400")} />
              <div className={cn("absolute bottom-0 right-0 w-4 h-4 border-b border-r", isDark ? "border-zinc-600" : "border-zinc-400")} />

              <h2 className={cn(
                "text-2xl md:text-3xl font-light tracking-tight mb-6",
                isDark ? "text-zinc-100" : "text-zinc-900"
              )}>
                Our Story
              </h2>
              <div className={cn(
                "space-y-4 text-base leading-relaxed",
                isDark ? "text-zinc-400" : "text-zinc-600"
              )}>
                <p>
                  StellarStack was born from frustration. As server administrators and hosting enthusiasts, we spent years wrestling with outdated panels, proprietary software, and tools that just didn&apos;t fit modern workflows.
                </p>
                <p>
                  We wanted something different: a game server panel built with modern technologies, designed for self-hosters, and developed in the open. One that respects your data, your infrastructure, and your time.
                </p>
                <p>
                  Today, StellarStack is that vision realized. Built with Next.js, Rust, and Docker, it represents what we believe game server management should be: fast, secure, and entirely under your control.
                </p>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Values Section */}
      <section className={cn(
        "relative py-24 px-6 border-y",
        isDark ? "border-zinc-800 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50"
      )}>
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <h2 className={cn(
              "text-3xl md:text-4xl font-extralight tracking-tight mb-4",
              isDark ? "text-zinc-100" : "text-zinc-900"
            )}>
              Our Values
            </h2>
            <p className={cn(
              "text-lg max-w-2xl mx-auto",
              isDark ? "text-zinc-400" : "text-zinc-600"
            )}>
              The principles that guide everything we build.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {values.map((value, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="h-full">
                <div className={cn(
                  "relative p-8 border transition-all h-full",
                  isDark
                    ? "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                )}>
                  <value.icon className={cn(
                    "w-8 h-8 mb-4",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )} />
                  <h3 className={cn(
                    "text-lg font-medium mb-2",
                    isDark ? "text-zinc-100" : "text-zinc-900"
                  )}>
                    {value.title}
                  </h3>
                  <p className={cn(
                    "text-sm leading-relaxed",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )}>
                    {value.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-6">
        <AnimatedSection className="max-w-4xl mx-auto text-center">
          <h2 className={cn(
            "text-3xl md:text-4xl font-extralight tracking-tight mb-6",
            isDark ? "text-zinc-100" : "text-zinc-900"
          )}>
            Join the Community
          </h2>
          <p className={cn(
            "text-lg mb-10 max-w-xl mx-auto",
            isDark ? "text-zinc-400" : "text-zinc-600"
          )}>
            Whether you&apos;re a user, contributor, or just curious, we&apos;d love to have you.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/stellarstack/stellarstack"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                className={cn(
                  "text-sm uppercase tracking-wider px-8 py-6 gap-2 transition-all hover:scale-[1.02]",
                  isDark
                    ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                    : "bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                )}
              >
                <BsGithub className="w-4 h-4" />
                Star on GitHub
              </Button>
            </a>
            <a href="https://discord.gg/stellarstack" target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                className={cn(
                  "text-sm uppercase tracking-wider px-8 py-6 gap-2",
                  isDark
                    ? "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    : "border-zinc-300 text-zinc-700 hover:border-zinc-400"
                )}
              >
                Join Discord
                <BsArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </AnimatedSection>
      </section>

      <Footer isDark={isDark} />
    </div>
  );
};

export default AboutPage;
