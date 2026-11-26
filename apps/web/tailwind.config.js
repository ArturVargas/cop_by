/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        wallet: {
          "brand": "rgb(var(--wallet-brand) / <alpha-value>)",
          "brand-hover": "rgb(var(--wallet-brand-hover) / <alpha-value>)",
          "ink": "rgb(var(--wallet-ink) / <alpha-value>)",
          "muted": "rgb(var(--wallet-muted) / <alpha-value>)",
          "purple": "rgb(var(--wallet-purple) / <alpha-value>)",
          "purple-hover": "rgb(var(--wallet-purple-hover) / <alpha-value>)",
          "border": "rgb(var(--wallet-border) / <alpha-value>)",
          "surface": "rgb(var(--wallet-surface) / <alpha-value>)",
          "card": "rgb(var(--wallet-card) / <alpha-value>)",
          "on-brand": "rgb(var(--wallet-on-brand) / <alpha-value>)",
          "positive-soft": "rgb(var(--wallet-positive-soft) / <alpha-value>)",
          "positive-border": "rgb(var(--wallet-positive-border) / <alpha-value>)",
          "negative": "rgb(var(--wallet-negative) / <alpha-value>)",
          "negative-soft": "rgb(var(--wallet-negative-soft) / <alpha-value>)",
          "negative-border": "rgb(var(--wallet-negative-border) / <alpha-value>)",
          "warning": "rgb(var(--wallet-warning) / <alpha-value>)",
          "warning-soft": "rgb(var(--wallet-warning-soft) / <alpha-value>)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "rgb(var(--wallet-brand) / <alpha-value>)",
          foreground: "rgb(var(--wallet-on-brand) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--wallet-ink) / <alpha-value>)",
          foreground: "rgb(var(--wallet-on-brand) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

module.exports = config;
