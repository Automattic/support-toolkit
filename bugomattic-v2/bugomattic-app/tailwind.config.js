/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2271b1',
        'primary-dark': '#135e96',
        background: '#f6f7f7',
        border: '#ccd0d4',
      },
    },
  },
  plugins: [],
}
