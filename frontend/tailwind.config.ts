export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('tailwindcss-scrollbar')({ nocompatible: true }),
  ],
}
