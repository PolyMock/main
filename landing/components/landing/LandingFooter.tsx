import Link from "next/link";
import PlaceholderLink from "@/components/landing/PlaceholderLink";

export default function LandingFooter() {
  return (
    <footer>
      <div className="footer-inner">
        <div className="footer-grid">
          <div className="footer-col">
            <div className="footer-brand-name">HashFox Labs</div>
            <p className="footer-desc">
              Building tools for backtesting and paper trading across markets.
            </p>
            <div className="footer-socials">
              <a href="https://x.com/hashfoxlabs" target="_blank" rel="noopener noreferrer">
                Twitter
              </a>
              <a href="https://t.me/hashfoxcommunity" target="_blank" rel="noopener noreferrer">
                Telegram
              </a>
            </div>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Products</div>
            <a href="https://polymock.app/" target="_blank" rel="noopener noreferrer">
              Polymock
            </a>
            <a href="https://blockberg.vercel.app/terminal" target="_blank" rel="noopener noreferrer">
              Blockberg
            </a>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Community</div>
            <Link href="/community">Community hub</Link>
            <a href="https://t.me/hashfoxcommunity" target="_blank" rel="noopener noreferrer">
              Telegram
            </a>
            <a href="https://x.com/hashfoxlabs" target="_blank" rel="noopener noreferrer">
              Twitter
            </a>
            <a href="https://github.com/HashFoxLabs" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Docs</div>
            <PlaceholderLink aria-label="Documentation (coming soon)">Documentation</PlaceholderLink>
          </div>
          <div className="footer-col">
            <div className="footer-col-title">Legal</div>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 HashFox Labs. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
