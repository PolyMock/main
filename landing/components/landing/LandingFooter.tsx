import Link from "next/link";
import PlaceholderLink from "@/components/landing/PlaceholderLink";

export default function LandingFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-glow" aria-hidden />
      <div className="footer-inner">
        <div className="footer-main">
          <div className="footer-brand-block">
            <div className="footer-brand-row">
              <img
                src="/hashfoxlogo.png"
                alt=""
                width={40}
                height={40}
                className="footer-brand-logo"
              />
              <span className="footer-brand-name">HashFox Labs</span>
            </div>
            <p className="footer-desc">
              Paper trading, backtesting, and live market data in one sandbox before you deploy real
              capital.
            </p>
            <div className="footer-socials">
              <a
                className="footer-social-pill"
                href="https://x.com/hashfoxlabs"
                target="_blank"
                rel="noopener noreferrer"
              >
                X (Twitter)
              </a>
              <a
                className="footer-social-pill"
                href="https://t.me/hashfoxcommunity"
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram
              </a>
            </div>
          </div>

          <div className="footer-columns">
            <nav className="footer-nav-col" aria-label="Products">
              <h3 className="footer-col-title">Products</h3>
              <ul className="footer-link-list">
                <li>
                  <a href="https://polymock.app/" target="_blank" rel="noopener noreferrer">
                    Polymock
                  </a>
                </li>
                <li>
                  <a
                    href="https://blockberg.vercel.app/terminal"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Blockberg
                  </a>
                </li>
              </ul>
            </nav>

            <nav className="footer-nav-col" aria-label="Community">
              <h3 className="footer-col-title">Community</h3>
              <ul className="footer-link-list">
                <li>
                  <Link href="/community">Community hub</Link>
                </li>
                <li>
                  <a href="https://t.me/hashfoxcommunity" target="_blank" rel="noopener noreferrer">
                    Telegram
                  </a>
                </li>
                <li>
                  <a href="https://x.com/hashfoxlabs" target="_blank" rel="noopener noreferrer">
                    X (Twitter)
                  </a>
                </li>
                <li>
                  <a href="https://github.com/HashFoxLabs" target="_blank" rel="noopener noreferrer">
                    GitHub
                  </a>
                </li>
              </ul>
            </nav>

            <nav className="footer-nav-col" aria-label="Documentation">
              <h3 className="footer-col-title">Docs</h3>
              <ul className="footer-link-list">
                <li>
                  <PlaceholderLink aria-label="Documentation (coming soon)">Documentation</PlaceholderLink>
                </li>
              </ul>
            </nav>

            <nav className="footer-nav-col" aria-label="Legal">
              <h3 className="footer-col-title">Legal</h3>
              <ul className="footer-link-list">
                <li>
                  <a href="#">Privacy Policy</a>
                </li>
                <li>
                  <a href="#">Terms of Service</a>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copyright">© 2026 HashFox Labs. All rights reserved.</p>
          <p className="footer-tag">Sandbox first. Trade with conviction.</p>
        </div>
      </div>
    </footer>
  );
}
