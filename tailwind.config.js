/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./features/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgba(var(--color-brand), <alpha-value>)",
          dark: "rgba(var(--color-brand-dark), <alpha-value>)",
          light: "rgba(var(--color-brand-light), <alpha-value>)",
        },
        surface: "rgba(var(--color-surface), <alpha-value>)",
        "surface-variant": "rgba(var(--color-surface-variant), <alpha-value>)",
        secondary: "rgba(var(--color-secondary), <alpha-value>)",
        cyan: "rgba(var(--color-cyan), <alpha-value>)",
        purple: "rgba(var(--color-purple), <alpha-value>)",
        navy: "rgba(var(--color-navy), <alpha-value>)",
        background: "rgba(var(--color-background), <alpha-value>)",
        "on-background": "rgba(var(--color-on-background), <alpha-value>)",
        error: "rgba(var(--color-error), <alpha-value>)",
        link: "rgba(var(--color-link), <alpha-value>)",
      },
    },
  },
  plugins: [],
};
