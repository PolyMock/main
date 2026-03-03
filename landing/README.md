# PulseTrader Landing Page - Next.js

A modern, high-performance landing page built with Next.js 15, perfectly matching the original PulseTrader.xyz design with smooth animations and professional glass morphism effects.

## ✨ Features

- **Next.js 15.5** with App Router & Turbopack
- **TypeScript** for type safety
- **Tailwind CSS v4** for modern styling
- **Framer Motion 11.15** for smooth animations
- **Glass Morphism Effects** - Professional blur and transparency effects
- **Fully Responsive** - Mobile, tablet, and desktop optimized
- **Performance Optimized** - Fast loading and smooth scrolling

## 🚀 Quick Start

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build

# Start production server
yarn start
```

The site will be available at **http://localhost:3000** (or 3001 if 3000 is in use).

## 📁 Project Structure

```
landing/frontend/
├── app/
│   ├── globals.css       # Global styles with glass effects
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Home page
├── components/
│   ├── Header.tsx        # Dynamic header with scroll effects
│   ├── Hero.tsx          # Hero section with animations
│   ├── Features.tsx      # Features grid with glass cards
│   ├── CTA.tsx           # Call-to-action section
│   └── Footer.tsx        # Footer component
├── public/
│   ├── images/           # All images
│   ├── videos/           # Background video
│   ├── cursor.svg        # Custom cursor
│   └── shiny-coins-loop.gif
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

## 🎨 Design System

### Glass Morphism Classes

- `.glass-dark` - Header and navigation
- `.glass-card` - Feature cards and content blocks
- `.glass-button` - Primary action buttons

### Color Scheme

- **Primary**: Green (#22C55E)
- **Gradients**: Green-300 → Green-400 → Green-600
- **Background**: Black (#000000)
- **Text**: White/Gray variations

### Responsive Breakpoints

- `sm`: 640px (Small devices)
- `md`: 768px (Tablets)
- `lg`: 1024px (Laptops)
- `xl`: 1280px (Desktops)

### Max-Width Containers

- Hero & CTA: `max-w-6xl` (1152px)
- Features: `max-w-7xl` (1280px)
- Footer: `max-w-6xl` (1152px)

## 🎭 Animations

All animations powered by **Framer Motion**:

- **Fade-in on scroll** - `initial={{ opacity: 0, y: 20 }}`
- **Staggered children** - Features cards animate sequentially
- **Hover effects** - Scale and lift on interaction
- **Smooth transitions** - 0.3s to 1s durations

## 🔧 Configuration

### Header Behavior

Dynamic width calculation based on scroll:
- Desktop (lg+): 900px → 650px (shrinks on scroll)
- Tablet (md): 500px max
- Mobile: 350px max

### Typography Scale

- `h1`: 3rem (mobile) → 4.5rem (desktop)
- `h2`: 2.5rem → 3.75rem
- Body: 1rem → 1.25rem

## 📦 Dependencies

```json
{
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "next": "^15.5.9",
  "framer-motion": "^11.15.0",
  "tailwindcss": "^4.0.0",
  "typescript": "^5.0.0"
}
```

## 🌐 Live Site

This codebase matches the exact design and functionality of:
**https://pulsetrader.xyz**

## 📝 Notes

- All animations preserve the original timing and easing
- Glass morphism effects use proper backdrop-blur and shadows
- Responsive design tested across all breakpoints
- Custom cursor SVG included
- Video background auto-plays with proper fallbacks

## 🎯 Next Steps for Rebranding to Polymock

When ready to rebrand for Polymock:

1. Update branding in `app/layout.tsx` (title, description)
2. Replace logo in `public/images/`
3. Update text content in all components
4. Modify color scheme in `app/globals.css` and `tailwind.config.ts`
5. Update links and CTAs

---

**Built with ❤️ matching PulseTrader.xyz design**
