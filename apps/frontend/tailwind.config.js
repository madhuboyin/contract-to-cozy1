// apps/frontend/tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Use the same darkMode setting
  darkMode: ['class'],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* ===== PHASE 3: STONE/AMBER TYPOGRAPHY (NEW) ===== */
      fontFamily: {
        // Outfit for body and sans
        sans: ['var(--font-outfit)', 'Outfit', 'sans-serif'],
        body: ['var(--font-outfit)', 'Outfit', 'sans-serif'],
        // Playfair Display for headings and serif
        serif: ['var(--font-playfair-display)', 'Playfair Display', 'serif'],
        heading: ['var(--font-playfair-display)', 'Playfair Display', 'serif'],
      },
      fontSize: {
        // Keeping existing size definitions but applying new font variables
        'xs': ['0.75rem', { lineHeight: '1.5' }],      // 12px
        'sm': ['0.875rem', { lineHeight: '1.5' }],     // 14px
        'base': ['1rem', { lineHeight: '1.6' }],       // 16px
        'lg': ['1.125rem', { lineHeight: '1.6' }],     // 18px
        'xl': ['1.25rem', { lineHeight: '1.5' }],      // 20px
        '2xl': ['1.5rem', { lineHeight: '1.4' }],      // 24px
        '3xl': ['1.75rem', { lineHeight: '1.3' }],     // 28px
        '4xl': ['2.25rem', { lineHeight: '1.2' }],     // 36px
        '5xl': ['3rem', { lineHeight: '1.1' }],        // 48px
        '6xl': ['3.75rem', { lineHeight: '1.1' }],     // New large size
      },
      lineHeight: {
        'tight': '1.2',
        'snug': '1.4',
        'normal': '1.6',
        'relaxed': '1.7',
        'loose': '1.8',
      },
      letterSpacing: {
        'tighter': '-0.05em',
        'tight': '-0.025em',
        'normal': '0',
        'wide': '0.025em',
        'wider': '0.05em',
        'widest': '0.1em',
        'button': '0.3px',
      },
      
      /* ===== PHASE 3: STONE/AMBER COLORS (NEW) ===== */
      colors: {
        // REMOVING ALL PREVIOUS TAILWIND COLORS (Teal/Blue/Gray extensions)
        // Only keeping hsl(var(--...)) definitions for shadcn-ui components
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        // New Custom Color Palette
        stone: {
          50: 'hsl(30 18% 98%)',   // #fafaf9
          100: 'hsl(30 15% 96%)',  // #f5f5f4
          200: 'hsl(30 12% 90%)',  // New Light Neutral
          300: 'hsl(30 8% 80%)',   // New Medium Neutral
          500: 'hsl(30 5% 50%)',   // New Default Neutral
          600: 'hsl(30 4% 38%)',   // Text Secondary
          700: 'hsl(30 3% 28%)',   // Text Primary
          800: 'hsl(30 3% 16%)',   // #292524
          900: 'hsl(30 3% 11%)',   // #1c1917 (Primary Dark)
        },
        amber: {
          50: 'hsl(40 100% 97%)',  // #fffbeb
          100: 'hsl(40 100% 90%)', // #fef3c7
          200: 'hsl(40 90% 80%)',
          300: 'hsl(40 80% 60%)',
          500: 'hsl(35 90% 45%)', // Accent Default
          600: 'hsl(30 80% 35%)',
          700: 'hsl(29 76% 24%)', // Primary Accent (Owner)
          800: 'hsl(26 75% 18%)',
          900: 'hsl(25 75% 14%)', // #78350f (Accent Dark)
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        '3xl': '1.5rem', // Added for new design
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
}