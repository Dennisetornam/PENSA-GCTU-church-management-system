import type { Config } from "tailwindcss";

export default {
  content: ["./web/index.html", "./web/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ivory: { DEFAULT: "#F8F4EC", soft: "#FCF9F3", deep: "#EFE7D6" },
        ink: { DEFAULT: "#211B33", soft: "#473F5C" },
        vespers: { DEFAULT: "#2A2247", deep: "#1B1631", muted: "#3A3158" },
        gold: { DEFAULT: "#C39A4A", soft: "#E3CB89", bright: "#D9B45F" },
        sage: { DEFAULT: "#6E7A63", soft: "#9AA48C" },
        clay: { DEFAULT: "#BC6A45" },
      },
      fontFamily: {
        display: ['"Fraunces Variable"', "Fraunces", "serif"],
        sans: ['"Hanken Grotesk Variable"', "Hanken Grotesk", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(33,27,51,.04), 0 12px 32px -16px rgba(33,27,51,.18)",
        lift: "0 2px 6px rgba(33,27,51,.06), 0 24px 48px -24px rgba(33,27,51,.26)",
        gold: "0 12px 40px -18px rgba(195,154,74,.55)",
      },
      borderRadius: { xl2: "1.25rem" },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        glow: { "0%,100%": { opacity: ".55" }, "50%": { opacity: ".8" } },
      },
      animation: { rise: "rise .7s cubic-bezier(.2,.7,.2,1) both", glow: "glow 7s ease-in-out infinite" },
    },
  },
  plugins: [],
} satisfies Config;
