"use client";

import { useRef, type JSX } from "react";
import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { AnimatedBackground } from "@workspace/ui/components/animated-background";
import { FloatingDots } from "@workspace/ui/components/floating-particles";
import {
  BsGithub,
  BsArrowRight,
  BsHeart,
  BsCode,
  BsGlobe,
  BsShieldCheck,
} from "react-icons/bs";
import { Footer } from "@/components/Footer";
import { Navigation } from "@/components/Navigation";
import { useIsMounted } from "@/hooks/useIsMounted";

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

const AboutPage = (): JSX.Element => {
  return (
    <div className="min-h-svh transition-colors relative bg-[#0b0b0a]">
      <AnimatedBackground />
      <FloatingDots count={20} />
      <Navigation />

      {/* Hero Section */}
      <section className="relative pt-32 pb-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl md:text-6xl font-extralight tracking-tight mb-6 text-zinc-100"
            >
              About StellarStack
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed text-zinc-400"
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
            <div className="relative p-8 md:p-12 border border-zinc-800 bg-zinc-900/30">
              {/* Corner decorations */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-zinc-600" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-zinc-600" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-zinc-600" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-zinc-600" />

              <h2 className="text-2xl md:text-3xl font-light tracking-tight mb-6 text-zinc-100">
                Our Story
              </h2>
              <div className="space-y-4 text-base leading-relaxed text-zinc-400">
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
      <section className="relative py-24 px-6 border-y border-zinc-800 bg-zinc-900/30">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extralight tracking-tight mb-4 text-zinc-100">
              Our Values
            </h2>
            <p className="text-lg max-w-2xl mx-auto text-zinc-400">
              The principles that guide everything we build.
            </p>
          </AnimatedSection>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {values.map((value, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="h-full">
                <div className="relative p-8 border transition-all h-full border-zinc-800 bg-zinc-900/50 hover:border-zinc-700">
                  <value.icon className="w-8 h-8 mb-4 text-zinc-400" />
                  <h3 className="text-lg font-medium mb-2 text-zinc-100">
                    {value.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400">
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
          <h2 className="text-3xl md:text-4xl font-extralight tracking-tight mb-6 text-zinc-100">
            Join the Community
          </h2>
          <p className="text-lg mb-10 max-w-xl mx-auto text-zinc-400">
            Whether you&apos;re a user, contributor, or just curious, we&apos;d love to have you.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="https://github.com/stellarstack/stellarstack"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                className="text-sm uppercase tracking-wider px-8 py-6 gap-2 transition-all hover:scale-[1.02] bg-zinc-100 text-zinc-900 hover:bg-white"
              >
                <BsGithub className="w-4 h-4" />
                Star on GitHub
              </Button>
            </a>
            <a href="https://discord.gg/stellarstack" target="_blank" rel="noopener noreferrer">
              <Button
                variant="outline"
                className="text-sm uppercase tracking-wider px-8 py-6 gap-2 border-zinc-700 text-zinc-300 hover:border-zinc-500"
              >
                Join Discord
                <BsArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>
        </AnimatedSection>
      </section>

      <Footer />
    </div>
  );
};

export default AboutPage;
