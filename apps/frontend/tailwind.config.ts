// apps/frontend/tailwind.config.js
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E5F5FF',
          100: '#CCE9FF',
          200: '#99D4FF',
          300: '#66BEFF',
          400: '#33A9FF',
          500: '#007FFF',
          600: '#0066CC',
          700: '#004C99',
          800: '#003366',
          900: '#001933',
        },
        teal: {
          50: '#F0FFFE',
          100: '#CCFFF9',
          200: '#99FFF4',
          300: '#66FFEE',
          400: '#33FFE9',
          500: '#00C4B4',
          600: '#009D90',
          700: '#00766C',
          800: '#004E48',
          900: '#002724',
        },
        coral: {
          50: '#FFE9F0',
          100: '#FFD3E1',
          200: '#FFA7C3',
          300: '#FF7BA5',
          400: '#FF4F87',
          500: '#FF6B9D',
          600: '#CC567E',
          700: '#99405E',
          800: '#662B3F',
          900: '#33151F',
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};

export default config;
