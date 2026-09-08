/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        console: {
          bg: "#0B111C",
          panel: "#121A29",
          panel2: "#182236",
          border: "#26324A",
          text: "#DCE4F0",
          muted: "#7C8CA8",
        },
        signal: {
          green: "#33D17A",
          amber: "#F2A93B",
          red: "#FF5C5C",
          blue: "#3E8FE0",
        },
      },
    },
  },
  plugins: [],
};
