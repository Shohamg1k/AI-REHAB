/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#F6F8FB",
        surface: "#FFFFFF",
        subtle: "#EEF2F7",
        inverse: "#0F172A",
        border: { DEFAULT: "#E2E8F0", strong: "#CBD5E1" },
        text: { primary: "#0F172A", secondary: "#475569", muted: "#8A97A8" },
        brand: { DEFAULT: "#0F766E", hover: "#115E59", soft: "#E3F2EF", border: "#9CCFC8" },
        success: { DEFAULT: "#15803D", soft: "#E6F5EC" },
        warning: { DEFAULT: "#B45309", soft: "#FDF0DC" },
        danger: { DEFAULT: "#B42318", soft: "#FDECEA" },
        pain: { DEFAULT: "#C2410C", soft: "#FDEDE3" },
        skeleton: { line: "#0EA5A5", joint: "#F59E0B" }
      },
      spacing: {
        "2": "2px",
        "4": "4px",
        "8": "8px",
        "12": "12px",
        "16": "16px",
        "20": "20px",
        "24": "24px",
        "32": "32px",
        "40": "40px"
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        pill: "999px"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      },
      fontSize: {
        display: ["32px", { lineHeight: "1.2", fontWeight: "700" }],
        "heading-24": ["24px", { lineHeight: "1.3", fontWeight: "700" }],
        "heading-20": ["20px", { lineHeight: "1.3", fontWeight: "600" }],
        title: ["17px", { lineHeight: "1.4", fontWeight: "600" }],
        body: ["16px", { lineHeight: "1.5" }],
        "body-md": ["15px", { lineHeight: "1.5", fontWeight: "500" }],
        "body-sm": ["14px", { lineHeight: "1.5" }],
        label: ["13px", { lineHeight: "1.4", fontWeight: "600" }],
        caption: ["12px", { lineHeight: "1.4" }],
        metric: ["40px", { lineHeight: "1.1", fontWeight: "700" }]
      },
      minHeight: {
        touch: "52px"
      }
    }
  },
  plugins: []
};
