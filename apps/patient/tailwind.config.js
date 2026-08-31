/** @type {import('tailwindcss').Config} */

/**
 * Design system v2 — tokens transcribed from the approved design source
 * (`figma-svg/_source/v2.html`, the `.ab` block), not re-invented here.
 * Names follow that source (`ink`/`ink2`/`ink3`, `teal`, `sunk`, `line`) so
 * a screen can be checked against its artboard by reading the class names
 * rather than translating a second vocabulary in between.
 *
 * The previous palette was a near-miss of this one — Inter instead of IBM
 * Plex, #0F766E instead of #0D6E68, #F6F8FB instead of #ECF0F1. Close enough
 * to look intentional, far enough to never quite match the comps.
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#ECF0F1",
        surf: "#FFFFFF",
        sunk: "#E2E8E9",
        line: { DEFAULT: "#D6DEDF", strong: "#C2CCCD" },
        ink: { DEFAULT: "#101617", 2: "#47575A", 3: "#7C8C8F" },
        teal: { DEFAULT: "#0D6E68", deep: "#084A46", wash: "#DCEBE8" },
        ok: { DEFAULT: "#1F7A4D", wash: "#E1F0E7" },
        warn: { DEFAULT: "#A75A0B", wash: "#F8EBD9" },
        dang: { DEFAULT: "#A32218", wash: "#F8E5E2", line: "#E7BBB4" },
        pain: { DEFAULT: "#B5410A", wash: "#F9E7DC" },
        // The camera viewport and anything overlaid on it.
        night: { DEFAULT: "#0C1414", 2: "#16211F", 3: "#233230" },
        skeleton: { line: "#3BE3D2", joint: "#FFC24D" }
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"]
      },
      fontSize: {
        // Named for the design source's type classes, values exact.
        d1: ["29px", { lineHeight: "1.14", letterSpacing: "-0.03em", fontWeight: "600" }],
        h1: ["22px", { lineHeight: "1.2", letterSpacing: "-0.025em", fontWeight: "600" }],
        h2: ["17px", { lineHeight: "1.42", letterSpacing: "-0.015em", fontWeight: "600" }],
        b1: ["15px", { lineHeight: "1.42" }],
        b2: ["13.5px", { lineHeight: "1.45" }],
        lb: ["10.5px", { lineHeight: "1.4", letterSpacing: "0.1em", fontWeight: "500" }],
        cap: ["12px", { lineHeight: "1.4" }],
        chip: ["11.5px", { lineHeight: "1.4", fontWeight: "500", letterSpacing: "0.02em" }],
        metric: ["40px", { lineHeight: "1.1", fontWeight: "700" }]
      },
      /*
       * A dense px scale, 0-80.
       *
       * Enumerated rather than listing only the values in use: a
       * missing entry produces *no class at all* rather than an error,
       * so `h-19` silently left an icon unsized and it rendered at its
       * container width. Covering the range removes that failure mode.
       */
      spacing: {
        0: "0px",
        1: "1px",
        2: "2px",
        3: "3px",
        4: "4px",
        5: "5px",
        6: "6px",
        7: "7px",
        8: "8px",
        9: "9px",
        10: "10px",
        11: "11px",
        12: "12px",
        13: "13px",
        14: "14px",
        15: "15px",
        16: "16px",
        17: "17px",
        18: "18px",
        19: "19px",
        20: "20px",
        21: "21px",
        22: "22px",
        23: "23px",
        24: "24px",
        25: "25px",
        26: "26px",
        27: "27px",
        28: "28px",
        29: "29px",
        30: "30px",
        31: "31px",
        32: "32px",
        33: "33px",
        34: "34px",
        35: "35px",
        36: "36px",
        37: "37px",
        38: "38px",
        39: "39px",
        40: "40px",
        41: "41px",
        42: "42px",
        43: "43px",
        44: "44px",
        45: "45px",
        46: "46px",
        47: "47px",
        48: "48px",
        49: "49px",
        50: "50px",
        51: "51px",
        52: "52px",
        53: "53px",
        54: "54px",
        55: "55px",
        56: "56px",
        57: "57px",
        58: "58px",
        59: "59px",
        60: "60px",
        61: "61px",
        62: "62px",
        63: "63px",
        64: "64px",
        65: "65px",
        66: "66px",
        67: "67px",
        68: "68px",
        69: "69px",
        70: "70px",
        71: "71px",
        72: "72px",
        73: "73px",
        74: "74px",
        75: "75px",
        76: "76px",
        77: "77px",
        78: "78px",
        79: "79px",
        80: "80px"
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "20px",
        pill: "999px"
      },
      boxShadow: {
        // `card.hair` in the source: a hairline that never adds layout height.
        hair: "inset 0 0 0 1px #D6DEDF",
        "hair-strong": "inset 0 0 0 1px #C2CCCD",
        lift: "0 1px 1px rgba(16,22,23,.04), 0 6px 16px rgba(16,22,23,.07)"
      },
      minHeight: {
        touch: "52px"
      }
    }
  },
  plugins: []
};
