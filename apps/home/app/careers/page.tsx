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
  BsGlobe,
  BsLaptop,
} from "react-icons/bs";
import { Footer } from "@/components/Footer";
import { Navigation } from "@/components/Navigation";
import { useIsMounted } from "@/hooks/useIsMounted";

const perks = [
  {
    icon: BsGlobe,
    title: "Fully Remote",
    description: "Work from anywhere in the world. We're a distributed team spanning multiple timezones.",
  },
  {
    icon: BsLaptop,
    title: "Open Source Impact",
    description: "Your work will be used by thousands of server administrators and gaming communities worldwide.",
  },
  {
    icon: BsHeart,
    title: "Community First",
    description: "Join a passionate community of developers and gamers building something meaningful together.",
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

const CareersPage = (): JSX.Element => {
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
              Join Our Team
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed text-zinc-400"
            >
              Help us build the future of open-source game server management. We&apos;re always looking for passionate contributors.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Perks Section */}
      <section className="relative py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {perks.map((perk, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="h-full">
                <div className="relative p-8 border transition-all h-full text-center border-zinc-800 bg-zinc-900/30 hover:border-zinc-700">
                  <perk.icon className="w-8 h-8 mx-auto mb-4 text-zinc-400" />
                  <h3 className="text-lg font-medium mb-2 text-zinc-100">
                    {perk.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-zinc-400">
                    {perk.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* Open Positions Section */}
      <section className="relative py-24 px-6 border-y border-zinc-800 bg-zinc-900/30">
        <div className="max-w-4xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-extralight tracking-tight mb-4 text-zinc-100">
              Open Positions
            </h2>
            <p className="text-lg max-w-2xl mx-auto text-zinc-400">
              We&apos;re an open-source project and welcome contributors of all kinds.
            </p>
          </AnimatedSection>

          <AnimatedSection delay={0.1}>
            <div className="relative p-8 md:p-12 border text-center border-zinc-800 bg-zinc-900/50">
              {/* Corner decorations */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-zinc-600" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-zinc-600" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-zinc-600" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-zinc-600" />

              <div className="text-6xl mb-6 text-zinc-700">
                🚀
              </div>
              <h3 className="text-xl font-medium mb-4 text-zinc-100">
                No Open Positions Right Now
              </h3>
              <p className="text-base mb-6 max-w-lg mx-auto text-zinc-400">
                We don&apos;t have any paid positions available at the moment, but we&apos;re always excited to welcome new contributors to our open-source project!
              </p>
              <p className="text-sm text-zinc-500">
                Check out our GitHub to see how you can contribute.
              </p>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-6">
        <AnimatedSection className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-extralight tracking-tight mb-6 text-zinc-100">
            Become a Contributor
          </h2>
          <p className="text-lg mb-10 max-w-xl mx-auto text-zinc-400">
            The best way to join our team is to start contributing. Every PR counts!
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
                View Open Issues
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

export default CareersPage;
