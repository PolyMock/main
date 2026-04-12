const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://fzrwnfojyvdpvrkcybte.supabase.co";
const SUPA_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6cnduZm9qeXZkcHZya2N5YnRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMTIyOTUsImV4cCI6MjA4ODU4ODI5NX0.vTabFKkFKmynTWJ9J8qy7_pfDUql7INZfVGyTkk-PII";

type UserRow = {
  username?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
};

type TradeRow = {
  users?: UserRow | null;
  position_type?: string | null;
  pnl?: number | null;
  market_title?: string | null;
  platform?: string | null;
  likes_count?: number | null;
  comments_count?: number | null;
  analysis?: string | null;
  _type?: string;
};

type StrategyRow = {
  users?: UserRow | null;
  strategy_name?: string | null;
  description?: string | null;
  total_return_percent?: number | null;
  platform?: string | null;
  likes_count?: number | null;
  comments_count?: number | null;
  win_rate?: number | null;
  _type?: string;
};

export async function hydrateCommunityGrid(): Promise<void> {
  const grid = document.getElementById("community-grid");
  if (!grid) return;

  const h: Record<string, string> = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
  };

  try {
    const [tRes, sRes] = await Promise.all([
      fetch(
        `${SUPA_URL}/rest/v1/trades?select=id,position_type,pnl,market_title,platform,likes_count,comments_count,analysis,created_at,users(username,avatar_url,banner_url)&is_published=eq.true&order=created_at.desc&limit=4`,
        { headers: h },
      ),
      fetch(
        `${SUPA_URL}/rest/v1/backtest_strategies?select=id,strategy_name,description,total_return_percent,platform,likes_count,comments_count,win_rate,created_at,users(username,avatar_url,banner_url)&is_published=eq.true&order=created_at.desc&limit=4`,
        { headers: h },
      ),
    ]);
    const trades = (await tRes.json()) as TradeRow[];
    const strategies = (await sRes.json()) as StrategyRow[];

    const posts: (TradeRow | StrategyRow)[] = [];
    const len = Math.max(
      Array.isArray(trades) ? trades.length : 0,
      Array.isArray(strategies) ? strategies.length : 0,
    );
    for (let i = 0; i < len && posts.length < 6; i++) {
      if (Array.isArray(trades) && trades[i])
        posts.push({ ...trades[i], _type: "trade" });
      if (posts.length < 6 && Array.isArray(strategies) && strategies[i])
        posts.push({ ...strategies[i], _type: "backtest" });
    }

    if (!posts.length) {
      grid.innerHTML =
        '<div class="comm-card" style="grid-column:1/-1;align-items:center;justify-content:center;text-align:center;color:var(--gray);">No posts yet — be the first to share!</div>';
      return;
    }

    grid.innerHTML = posts
      .map((p) => {
        const user = p.users || {};
        const username = user.username || "anon";
        const initial = username.charAt(0).toUpperCase();
        const avatarHtml = user.avatar_url
          ? `<div class="comm-avatar"><img src="${user.avatar_url}" alt="${username}"></div>`
          : `<div class="comm-avatar">${initial}</div>`;
        const bannerDiv = user.banner_url
          ? `<div class="comm-footer-banner" style="background-image:url('${user.banner_url}')"></div>`
          : `<div class="comm-footer-banner no-banner"></div>`;
        const platformStr = p.platform ? String(p.platform) : "";
        const platform = platformStr
          ? platformStr.charAt(0).toUpperCase() + platformStr.slice(1)
          : "";

        if (p._type === "trade") {
          const tp = p as TradeRow;
          const pnl = typeof tp.pnl === "number" ? tp.pnl : 0;
          const pnlClass = pnl >= 0 ? "positive" : "negative";
          const pnlStr = (pnl >= 0 ? "+" : "") + pnl.toFixed(2) + " USDC";
          const posType = tp.position_type
            ? tp.position_type.toUpperCase()
            : "TRADE";
          const title = tp.market_title || "Paper Trade";
          const analysis = tp.analysis
            ? tp.analysis.slice(0, 120) + (tp.analysis.length > 120 ? "…" : "")
            : "";
          return [
            '<div class="comm-card">',
            `  <div class="comm-card-header"><span class="comm-type-badge comm-type-trade">${posType}</span><span class="comm-platform">${platform}</span></div>`,
            `  <div class="comm-title">${title}</div>`,
            `  <div class="comm-pnl ${pnlClass}">${pnlStr}</div>`,
            analysis ? `  <div class="comm-analysis">${analysis}</div>` : "",
            `  <div class="comm-footer">`,
            bannerDiv,
            `    <div class="comm-footer-inner">`,
            `      <div class="comm-user">${avatarHtml}<span class="comm-username">@${username}</span></div>`,
            `      <div class="comm-meta"><span>♥ ${tp.likes_count || 0}</span><span>💬 ${tp.comments_count || 0}</span></div>`,
            `    </div>`,
            `  </div>`,
            `</div>`,
          ].join("");
        }
        const sp = p as StrategyRow;
        const ret =
          typeof sp.total_return_percent === "number"
            ? sp.total_return_percent
            : 0;
        const retClass = ret >= 0 ? "positive" : "negative";
        const retStr = (ret >= 0 ? "+" : "") + ret.toFixed(1) + "% Return";
        const winRate =
          typeof sp.win_rate === "number" ? sp.win_rate.toFixed(0) + "%" : "—";
        const desc = sp.description
          ? sp.description.slice(0, 120) +
            (sp.description.length > 120 ? "…" : "")
          : "";
        return [
          '<div class="comm-card">',
          '  <div class="comm-card-header"><span class="comm-type-badge comm-type-backtest">Backtest</span><span class="comm-platform">' +
            platform +
            "</span></div>",
          `  <div class="comm-title">${sp.strategy_name || "Strategy"}</div>`,
          `  <div class="comm-pnl ${retClass}">${retStr}</div>`,
          `  <div class="comm-stats"><span>Win Rate <strong style="color:#fff;margin-left:0.25rem">${winRate}</strong></span></div>`,
          desc ? `  <div class="comm-analysis">${desc}</div>` : "",
          `  <div class="comm-footer">`,
          bannerDiv,
          `    <div class="comm-footer-inner">`,
          `      <div class="comm-user">${avatarHtml}<span class="comm-username">@${username}</span></div>`,
          `      <div class="comm-meta"><span>♥ ${sp.likes_count || 0}</span><span>💬 ${sp.comments_count || 0}</span></div>`,
          `    </div>`,
          `  </div>`,
          `</div>`,
        ].join("");
      })
      .join("");
  } catch (err) {
    console.error("Community fetch error:", err);
    grid.innerHTML =
      '<div class="comm-card" style="grid-column:1/-1;text-align:center;color:var(--gray);">Could not load community posts.</div>';
  }
}
