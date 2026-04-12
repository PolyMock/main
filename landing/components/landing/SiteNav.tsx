"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header id="site-nav">
      <div className="nav-inner">
        <Link
          href="/"
          className="nav-logo"
          onClick={(e) => {
            if (isHome) {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }
          }}
        >
          <img src="/hashfoxlogo.png" alt="HashFox Labs Logo" />
          <span>HashFox Labs</span>
        </Link>
        <nav className="nav-links">
          <a href={isHome ? "#how-section" : "/#how-section"}>Custom</a>
          <a href={isHome ? "#faq-section" : "/#faq-section"}>FAQ</a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            aria-label="Documentation (coming soon)"
          >
            Docs
          </a>
          <Link href="/community">Community</Link>
        </nav>
        <a
          href="https://polymock.app/"
          target="_blank"
          rel="noreferrer"
          className="nav-cta"
        >
          Launch App
        </a>
      </div>
    </header>
  );
}
