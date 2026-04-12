import Link from "next/link";
import SiteNav from "@/components/landing/SiteNav";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <>
      <div id="bubble-container" />
      <div id="three-container" />
      <div className="noise-overlay" />
      <div className="grain-overlay" />

      <SiteNav />

      <section id="hero-section">
        <div id="apps-section" aria-hidden style={{ height: 0, overflow: "hidden" }} />
        <div className="hero-content">
          <div className="hero-badge">From practice to live Execution</div>
          <h1 className="hero-title">
            Learn Any Market,
            <br />
            Without Risk
          </h1>
          <p className="hero-sub">
            HashFox Labs is the universal sandbox for traders. Backtest strategies and paper-trade
            across crypto, prediction markets, forex, and stocks, all in one place before going
            live.
          </p>
          <div className="hero-actions">
            <a href="https://polymock.app/" target="_blank" rel="noreferrer" className="btn-primary">
              Start Paper Trading →
            </a>
            <Link href="/community" className="btn-ghost-hero">
              Community Hub
            </Link>
          </div>
        </div>
        <div className="scroll-hint">
          <div>Scroll to explore</div>
          <div className="scroll-arrow">↓</div>
        </div>
      </section>

      <section id="everything-section">
        <div className="everything-content">
          <div className="everything-img-wrap reveal-scale">
            <img src="/backtest.png" alt="Backtest Dashboard" className="everything-img" />
          </div>
        </div>
        <div id="chart-ui" style={{ display: "none" }}>
          <div id="morph-name" />
          <div id="morph-counter" />
          <div id="morph-progress" />
        </div>
      </section>

      <section id="platform-section">
        <div className="platform-grid">
          <div className="platform-left reveal-left">
            <div className="platform-label">The Platform</div>
            <h2 className="platform-heading">
              Master any market,
              <br />
              <em>risk-free</em>
            </h2>
            <p className="platform-text">
              Every trade is recorded on-chain via Solana, verifiable and shareable. Live data from
              Pyth, Polymarket, TradingView and Twelve Data. Your performance is public proof. Share
              your edge and go live when the numbers back you up.
            </p>
          </div>
          <div className="platform-right stagger-children">
            <div className="platform-stat reveal">
              <img src="/solana.png" className="platform-logo" alt="Solana" />
              <div className="platform-stat-value orange">Solana</div>
              <div className="platform-stat-label">On-Chain Execution</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/poly.png" className="platform-logo" alt="Polymarket" />
              <div className="platform-stat-value orange">Polymarket</div>
              <div className="platform-stat-label">Prediction Markets</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/pyth.png" className="platform-logo" alt="Pyth" />
              <div className="platform-stat-value orange">Pyth</div>
              <div className="platform-stat-label">Crypto Price Data</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/magicblock.png" className="platform-logo" alt="MagicBlock" />
              <div className="platform-stat-value orange">MagicBlock</div>
              <div className="platform-stat-label">Instant Execution</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/trading-view.png" className="platform-logo" alt="TradingView" />
              <div className="platform-stat-value orange">TradingView</div>
              <div className="platform-stat-label">Pro Charts</div>
            </div>
            <div className="platform-stat reveal">
              <img src="/twelve.png" className="platform-logo" alt="Twelve Data" />
              <div className="platform-stat-value orange">Twelve Data</div>
              <div className="platform-stat-label">Forex &amp; Stocks</div>
            </div>
          </div>
        </div>
      </section>

      <section id="paper-trading-section" className="how-section-standalone">
        <div className="section-inner">
          <div className="section-header reveal">
            <h2 className="paper-title">What is Paper Trading?</h2>
            <p
              className="hero-sub"
              style={{ animation: "none", marginBottom: "1rem" }}
            >
              Paper trading allows you to simulate real trading with virtual money. It&apos;s the
              perfect way to test strategies, learn market dynamics, and build confidence before
              risking actual capital.
            </p>
            <p className="hero-sub" style={{ animation: "none", marginBottom: 0 }}>
              Our platform provides real-time market data from prediction markets and crypto
              exchanges, giving you an authentic trading experience without the financial risk.
            </p>
          </div>
          <div className="paper-chart-wrap reveal">
            <img src="/blockberg.png" alt="Blockberg Trading Platform" className="paper-chart-img" />
          </div>

          <div className="section-header reveal" style={{ marginTop: 80 }}>
            <div className="section-badge">Live from the Community</div>
            <h2 className="section-title gradient-text">Community Hub</h2>
            <p
              className="hero-sub"
              style={{
                animation: "none",
                marginBottom: 0,
                maxWidth: 640,
                marginInline: "auto",
              }}
            >
              Share your paper trades and backtested strategies, comment on others&apos; results, and
              learn from real traders in real time.
            </p>
          </div>
          <div className="community-grid reveal" id="community-grid">
            <div className="comm-card skeleton" />
            <div className="comm-card skeleton" />
            <div className="comm-card skeleton" />
          </div>
          <div className="reveal" style={{ textAlign: "center", marginTop: "2rem" }}>
            <Link href="/community" className="btn-primary small">
              View All Posts →
            </Link>
          </div>
        </div>
      </section>

      <section id="how-section" className="how-section-standalone grid-bg">
        <div className="how-two-col section-inner">
          <div className="how-left">
            <div className="how-header">
              <h2 className="section-title orange">How It Works</h2>
            </div>
            <div className="steps">
              <div className="step">
                <div className="step-num">1</div>
                <div>
                  <h4>Create an Account</h4>
                  <p>
                    Sign up for free and get instant access to paper trading and backtesting tools
                    across all markets.
                  </p>
                </div>
              </div>
              <div className="step">
                <div className="step-num">2</div>
                <div>
                  <h4>Pick a Market</h4>
                  <p>
                    Choose from crypto, prediction markets, forex, or stocks, all available on a
                    single platform.
                  </p>
                </div>
              </div>
              <div className="step">
                <div className="step-num">3</div>
                <div>
                  <h4>Paper Trade or Backtest</h4>
                  <p>
                    Trade on live data with zero risk, or backtest your strategies on historical data
                    with advanced parameters.
                  </p>
                </div>
              </div>
              <div className="step">
                <div className="step-num">4</div>
                <div>
                  <h4>Analyze &amp; Optimize</h4>
                  <p>
                    Review win rates, drawdowns, and risk-reward ratios to refine your strategy
                    before committing real capital.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="how-right">
            <canvas id="gear-canvas" />
          </div>
        </div>
      </section>

      <section id="blob-platform-section">
        <canvas id="blob-canvas" />
        <div className="mp-text reveal">
          <div className="mp-badge">Coming Soon</div>
          <h2 className="mp-title">Multi-Platform Integration</h2>
          <p className="mp-sub">
            We&apos;re building a unified platform to paper-trade across all markets: crypto,
            prediction markets, forex, and stocks, with one single balance. Trade everything from
            one place.
          </p>
        </div>
      </section>

      <div id="content">
        <section id="faq-section" className="content-section">
          <div className="section-inner">
            <div
              className="section-header reveal"
              style={{ textAlign: "center", marginBottom: "4rem" }}
            >
              <h2
                style={{
                  fontSize: "clamp(2rem,5vw,3rem)",
                  fontWeight: 700,
                  color: "#f97316",
                  marginBottom: "1rem",
                }}
              >
                Frequently Asked Questions
              </h2>
              <p style={{ fontSize: "1.125rem", color: "#ffffff" }}>
                Everything you need to know about us
              </p>
            </div>
            <div className="faq-list">
              <details>
                <summary>What is HashFox Labs?</summary>
                <div className="faq-answer">
                  HashFox Labs is a product studio focused on building trading and DeFi products. We
                  develop our own platforms like Polymock and Blockberg, build custom products for
                  clients across various ecosystems, and regularly ship projects at hackathons.
                </div>
              </details>
              <details>
                <summary>What is Polymock?</summary>
                <div className="faq-answer">
                  Polymock is our paper trading and backtesting platform for prediction markets. It
                  uses historical data from Polymarket to let you test your market intuition and
                  trading strategies in a zero-risk environment.
                </div>
              </details>
              <details>
                <summary>What is Blockberg?</summary>
                <div className="faq-answer">
                  Blockberg is our paper trading and backtesting platform for crypto markets. Trade
                  live crypto data with zero risk and backtest your strategies on historical market
                  data across various crypto assets.
                </div>
              </details>
              <details>
                <summary>Is it free to use?</summary>
                <div className="faq-answer">
                  Yes! Our core backtesting and paper trading features are free to use. You can also
                  unlock premium features and participate in prizepool competitions to earn rewards
                  while testing your skills against other traders.
                </div>
              </details>
              <details>
                <summary>Do I need to connect a wallet?</summary>
                <div className="faq-answer">
                  A Solana wallet is required for on-chain paper trading, as your virtual balance is
                  stored in PDA accounts on Solana. However, no wallet is needed for backtesting —
                  you can test strategies on historical data without connecting anything.
                </div>
              </details>
              <details>
                <summary>What data sources do you use?</summary>
                <div className="faq-answer">
                  We use Dome API and Polymarket API for prediction markets data, Pyth Network and
                  TradingView for crypto assets, and Twelve Data for forex, stocks, and commodities.
                </div>
              </details>
              <details>
                <summary>Can I test my own trading strategies?</summary>
                <div className="faq-answer">
                  Yes! You can currently define custom strategies with entry/exit rules and risk
                  management parameters. We&apos;re also working on v3, where you&apos;ll simply
                  describe your strategy in a prompt and our engine will handle the rest.
                </div>
              </details>
              <details>
                <summary>What is the main goal?</summary>
                <div className="faq-answer">
                  Our vision is to build a unified sandbox platform where you can backtest and
                  paper-trade any market — crypto, prediction markets, forex, stocks — all in one
                  place before going live. One platform, one balance, every market.
                </div>
              </details>
            </div>
          </div>
        </section>

        <section className="content-section cta-bg" id="final-section">
          <div
            className="section-inner"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 0,
            }}
          >
            <h2 className="paper-title reveal" style={{ marginBottom: "1rem" }}>
              Wear the <span style={{ color: "var(--orange)" }}>HashFox</span> Mask
              <br />
              <span
                style={{
                  fontSize: "0.65em",
                  background: "linear-gradient(to right,#f97316,#ffffff)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Join the Community
              </span>
            </h2>
            <p
              className="section-sub reveal"
              style={{ maxWidth: 640, marginBottom: "2.5rem", color: "#ffffff" }}
            >
              Step into the arena. Connect with traders, share strategies and give feedback.
            </p>
            <canvas
              id="fox-canvas"
              className="reveal"
              style={{
                width: "100%",
                maxWidth: 520,
                height: 420,
                display: "block",
                cursor: "grab",
                borderRadius: 16,
                marginBottom: "2.5rem",
              }}
            />
            <div className="cta-actions reveal">
              <a href="https://discord.gg/W4c3Sep5Qq" target="_blank" rel="noreferrer" className="btn-ghost large">
                Discord
              </a>
              <Link href="/community" className="btn-primary large">
                Community Hub
              </Link>
              <a
                href="https://t.me/hashfoxcommunity"
                target="_blank"
                rel="noreferrer"
                className="btn-ghost large"
              >
                Telegram
              </a>
            </div>
          </div>
        </section>

        <LandingFooter />
      </div>
    </>
  );
}
