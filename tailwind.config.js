/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        spotify: {
          black: "#121212",
          dark: "#181818",
          darker: "#0a0a0a",
          gray: "#282828",
          lightgray: "#b3b3b3",
          green: "#1db954",
          "green-hover": "#1ed760",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
