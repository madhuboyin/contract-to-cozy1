/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
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
        // Brand color extensions - map blue classes to teal
        blue: {
          50: 'hsl(173 44% 95%)',    // Very light teal
          100: 'hsl(173 44% 88%)',   // Light teal
          200: 'hsl(173 44% 76%)',   // Lighter teal
          300: 'hsl(173 44% 64%)',   // Light-medium teal
          400: 'hsl(173 44% 51%)',   // Medium teal (#4DB6AC - our light primary)
          500: 'hsl(174 60% 40%)',   // Medium-dark teal
          600: 'hsl(174 100% 29%)',  // Teal primary (#009688)
          700: 'hsl(174 100% 24%)',  // Dark teal
          800: 'hsl(174 100% 19%)',  // Darker teal
          900: 'hsl(174 100% 14%)',  // Very dark teal
        },
        // Keep gray scale for text and backgrounds
        gray: {
          50: 'hsl(0 0% 98%)',      // #FAFAFA - our light background
          100: 'hsl(0 0% 96%)',
          200: 'hsl(0 0% 90%)',
          300: 'hsl(0 0% 83%)',
          400: 'hsl(0 0% 63%)',
          500: 'hsl(0 0% 45%)',
          600: 'hsl(0 0% 38%)',     // #616161 - our secondary text
          700: 'hsl(0 0% 26%)',
          800: 'hsl(0 0% 18%)',
          900: 'hsl(0 0% 13%)',     // #212121 - our primary text
        },
        // Brand-specific utilities
        brand: {
          primary: 'hsl(var(--color-primary))',           // #009688
          'primary-light': 'hsl(var(--color-primary-light))', // #4DB6AC
          background: 'hsl(var(--color-background))',     // #FAFAFA
          'background-dark': 'hsl(var(--color-background-dark))', // #263238
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
