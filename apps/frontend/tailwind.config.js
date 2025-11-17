/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* ===== PHASE 2: TYPOGRAPHY ===== */
      fontFamily: {
        heading: ['var(--font-poppins)', 'Poppins', 'sans-serif'],
        body: ['var(--font-inter)', 'Inter', 'sans-serif'],
        sans: ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
      fontSize: {
        // Precise control over font sizes
        'xs': ['0.75rem', { lineHeight: '1.5' }],      // 12px
        'sm': ['0.875rem', { lineHeight: '1.5' }],     // 14px
        'base': ['1rem', { lineHeight: '1.6' }],       // 16px
        'lg': ['1.125rem', { lineHeight: '1.6' }],     // 18px
        'xl': ['1.25rem', { lineHeight: '1.5' }],      // 20px
        '2xl': ['1.5rem', { lineHeight: '1.4' }],      // 24px
        '3xl': ['1.75rem', { lineHeight: '1.3' }],     // 28px
        '4xl': ['2.25rem', { lineHeight: '1.2' }],     // 36px
        '5xl': ['3rem', { lineHeight: '1.1' }],        // 48px
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
      
      /* ===== PHASE 1: COLORS ===== */
      colors: {
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
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))'
        },
        // Brand color extensions - teal palette
        blue: {
          50: 'hsl(173 44% 95%)',
          100: 'hsl(173 44% 88%)',
          200: 'hsl(173 44% 76%)',
          300: 'hsl(173 44% 64%)',
          400: 'hsl(173 44% 51%)',   // #4DB6AC
          500: 'hsl(174 60% 40%)',
          600: 'hsl(174 100% 29%)',  // #009688
          700: 'hsl(174 100% 24%)',
          800: 'hsl(174 100% 19%)',
          900: 'hsl(174 100% 14%)',
        },
        gray: {
          50: 'hsl(0 0% 98%)',
          100: 'hsl(0 0% 96%)',
          200: 'hsl(0 0% 90%)',
          300: 'hsl(0 0% 83%)',
          400: 'hsl(0 0% 63%)',
          500: 'hsl(0 0% 45%)',
          600: 'hsl(0 0% 38%)',
          700: 'hsl(0 0% 26%)',
          800: 'hsl(0 0% 18%)',
          900: 'hsl(0 0% 13%)',
        },
        brand: {
          primary: 'hsl(var(--color-primary))',
          'primary-light': 'hsl(var(--color-primary-light))',
          background: 'hsl(var(--color-background))',
          'background-dark': 'hsl(var(--color-background-dark))',
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
}
