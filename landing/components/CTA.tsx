"use client";

import { motion } from "framer-motion";

export default function CTA() {
  return (
    <section id="community-section" className="relative py-20 px-6 bg-black">
      {/* SVG Grid Pattern Background */}
      <div className="absolute inset-0 opacity-20">
        <svg width="100%" height="100%">
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl lg:text-5xl font-bold mb-6 bg-gradient-to-r from-white via-orange-400 to-orange-600 bg-clip-text text-transparent">
            Join the Community
          </h2>
          <p className="text-lg lg:text-xl text-gray-400 max-w-2xl mx-auto mb-8">
            Connect with other traders, share strategies, give feedback, and stay updated on new product releases.
          </p>
          <button
            onClick={() =>
              window.open("https://t.me/hashfoxlabs", "_blank")
            }
            className="bg-orange-500 hover:bg-orange-600 px-8 py-3 rounded-full font-semibold text-black hover:scale-105 transition-all text-lg"
          >
            Join Telegram →
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="flex justify-center overflow-hidden rounded-2xl mx-auto"
          style={{ width: 400, height: 400 }}
        >
          <video
            src="/hashfox.mp4"
            autoPlay
            loop
            muted
            playsInline
            width={400}
            height={400}
            className="max-w-full h-auto mix-blend-screen scale-110 brightness-125 saturate-150"
          />
        </motion.div>
      </div>
    </section>
  );
}
