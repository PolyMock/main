export function initScrollEffects(): void {
  const navEl = document.getElementById("site-nav");
  function updateNavWidth() {
    if (!navEl) return;
    const w = window.innerWidth;
    if (w >= 1024) {
      const width = Math.max(650, 900 - window.scrollY);
      navEl.style.width = width + "px";
    } else {
      navEl.style.width = "";
    }
  }

  const bubbleEl = document.getElementById("bubble-container");
  const threeEl = document.getElementById("three-container");
  const chartUIEl = document.getElementById("chart-ui");

  function updateScroll() {
    const s = window.scrollY;
    const vh = window.innerHeight;

    updateNavWidth();

    const howSection = document.getElementById("how-section");
    const howBottom = howSection
      ? howSection.offsetTop + howSection.offsetHeight
      : vh * 4.2;
    const globeFade = Math.max(
      0,
      1 - Math.max(0, s - howBottom) / (vh * 0.4),
    );
    if (threeEl) threeEl.style.opacity = String(globeFade);
    if (chartUIEl) chartUIEl.style.opacity = "0";
    if (bubbleEl) bubbleEl.style.opacity = "0";
  }
  window.addEventListener("scroll", updateScroll, { passive: true });
  updateScroll();

  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href")?.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  const revealEls = document.querySelectorAll(
    ".reveal, .reveal-left, .reveal-right, .reveal-scale",
  );
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );
  revealEls.forEach((el) => revealObserver.observe(el));
}
