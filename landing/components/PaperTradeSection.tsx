"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function PaperTradeSection() {
  return (
    <section id="paper-trade-section" className="pt-20 pb-8 px-6 bg-gray-900/30">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-block bg-orange-500/20 px-6 py-3 rounded-full backdrop-blur-md border border-orange-400/30 mb-6">
            <span className="text-white font-medium text-sm">Paper Trading</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-orange-400 to-orange-600 bg-clip-text text-transparent">
            Practice Without Risk
          </h2>
          <p className="text-xl md:text-2xl text-white max-w-3xl mx-auto">
            Test your strategies with virtual capital in real market conditions
          </p>
        </motion.div>

        {/* Content Grid */}
        <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
          {/* Left - Explanation */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h3 className="text-3xl font-bold text-white mb-6">
              What is Paper Trading?
            </h3>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>
                Paper trading allows you to simulate real trading with virtual money.
                It&apos;s the perfect way to test strategies, learn market dynamics, and
                build confidence before risking actual capital.
              </p>
              <p>
                Our platform provides real-time market data from prediction markets and
                crypto exchanges, giving you an authentic trading experience without the
                financial risk.
              </p>
            </div>

            <div className="mt-8 grid grid-cols-2 gap-4">
              <div className="bg-black p-4 rounded-xl border border-orange-500/20">
                <div className="h-10 flex items-center mb-2">
                  <Image src="/images/logo-partners/solana.png" alt="Solana" width={28} height={28} className="object-contain" />
                </div>
                <div className="text-lg font-bold text-white">On-Chain Execution</div>
                <div className="text-xs text-gray-300 mt-1">Virtual balance stored in Solana PDA accounts</div>
              </div>
              <div className="bg-black p-4 rounded-xl border border-orange-500/20">
                <div className="h-10 flex items-center gap-2 mb-2">
                  <Image src="/images/logo-partners/poly.png" alt="Polymarket" width={28} height={28} className="object-contain" />
                  <Image src="/images/logo-partners/pyth.png" alt="Pyth" width={28} height={28} className="object-contain" />
                  <Image src="/images/logo-partners/twelve.png" alt="Twelve" width={28} height={28} className="object-contain" />
                </div>
                <div className="text-lg font-bold text-white">Real-Time Live Data</div>
                <div className="text-xs text-gray-300 mt-1">All markets, one platform</div>
              </div>
              <div className="bg-black p-4 rounded-xl border border-orange-500/20">
                <div className="h-10 flex items-center mb-2">
                  <Image src="/images/logo-partners/magicblock.png" alt="MagicBlock" width={28} height={28} className="object-contain" />
                </div>
                <div className="text-lg font-bold text-white">Instant Execution</div>
                <div className="text-xs text-gray-300 mt-1">Powered by MagicBlock Ephemeral Rollups</div>
              </div>
              <div className="bg-black p-4 rounded-xl border border-orange-500/20">
                <div className="h-10 flex items-center mb-2">
                  <Image src="/images/logo-partners/trading-view.png" alt="TradingView" width={28} height={28} className="object-contain" />
                </div>
                <div className="text-lg font-bold text-white">Pro Charts & Analysis</div>
                <div className="text-xs text-gray-300 mt-1">Full TradingView charting tools built in</div>
              </div>
            </div>
          </motion.div>

          {/* Right - Visual */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <div className="glass-card p-2 rounded-2xl overflow-hidden">
              <Image
                src="/images/chart.png"
                alt="Chart"
                width={1200}
                height={800}
                className="w-full h-full object-cover rounded-xl hover:scale-[1.01] transition-transform duration-300"
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
