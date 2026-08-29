// Runs inside the page. Converts every .ab artboard into a standalone SVG string.
// Returns [{ name, svg }]. Text becomes real <text> nodes; inline <svg> is preserved.
(function () {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const NS = "http://www.w3.org/2000/svg";

  function toRGBA(c) {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x.trim()));
    const a = p.length > 3 ? p[3] : 1;
    if (a === 0) return null;
    const hex = "#" + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    return { hex, a };
  }

  // linear-gradient(180deg, rgba(..) 0%, rgba(..) 22%, ...) -> svg linearGradient
  function parseGradient(bi) {
    if (!bi || bi === "none" || bi.indexOf("linear-gradient") !== 0) return null;
    const inner = bi.slice(bi.indexOf("(") + 1, bi.lastIndexOf(")"));
    const tokens = [];
    let depth = 0, cur = "";
    for (const ch of inner) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { tokens.push(cur.trim()); cur = ""; } else cur += ch;
    }
    if (cur.trim()) tokens.push(cur.trim());
    let angle = 180;
    if (/^-?[\d.]+deg$/.test(tokens[0])) angle = parseFloat(tokens.shift());
    else if (/^to /.test(tokens[0])) {
      const d = tokens.shift();
      angle = /bottom/.test(d) ? 180 : /top/.test(d) ? 0 : /right/.test(d) ? 90 : 270;
    }
    const stops = [];
    for (const t of tokens) {
      const cm = t.match(/^(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})\s*(.*)$/);
      if (!cm) continue;
      const col = toRGBA(cm[1]) || { hex: cm[1], a: 1 };
      let off = cm[2].trim();
      stops.push({ hex: col.hex, a: col.a, off: off.endsWith("%") ? parseFloat(off) / 100 : null });
    }
    if (stops.length < 2) return null;
    if (stops[0].off === null) stops[0].off = 0;
    if (stops[stops.length - 1].off === null) stops[stops.length - 1].off = 1;
    for (let i = 1; i < stops.length - 1; i++) if (stops[i].off === null) stops[i].off = i / (stops.length - 1);
    const rad = (angle - 180) * Math.PI / 180;
    const vx = Math.sin(rad), vy = Math.cos(rad);
    const x1 = (0.5 - vx / 2).toFixed(4), y1 = (0.5 + vy / 2).toFixed(4);
    const x2 = (0.5 + vx / 2).toFixed(4), y2 = (0.5 - vy / 2).toFixed(4);
    return { x1, y1, x2, y2, stops };
  }

  // "rgb(214, 222, 223) 0px 0px 0px 1px inset" -> {hex, a, w}
  function insetRing(bs) {
    if (!bs || bs === "none") return null;
    if (bs.indexOf("inset") === -1) return null;
    const col = toRGBA(bs);
    if (!col) return null;
    const nums = bs.match(/(-?\d+(?:\.\d+)?)px/g);
    if (!nums || nums.length < 4) return null;
    const spread = parseFloat(nums[3]);
    if (!spread || spread <= 0) return null;
    return { hex: col.hex, a: col.a, w: spread };
  }

  function radii(cs, w, h) {
    const get = (v) => {
      const n = parseFloat(v);
      if (isNaN(n)) return 0;
      return v.indexOf("%") > -1 ? (n / 100) * Math.min(w, h) : n;
    };
    const tl = get(cs.borderTopLeftRadius), tr = get(cs.borderTopRightRadius);
    const br = get(cs.borderBottomRightRadius), bl = get(cs.borderBottomLeftRadius);
    return { tl, tr, br, bl, uniform: tl === tr && tr === br && br === bl ? tl : null };
  }

  function roundedPath(x, y, w, h, r) {
    const tl = Math.min(r.tl, w / 2, h / 2), tr = Math.min(r.tr, w / 2, h / 2);
    const br = Math.min(r.br, w / 2, h / 2), bl = Math.min(r.bl, w / 2, h / 2);
    return `M${x + tl},${y} H${x + w - tr} A${tr},${tr} 0 0 1 ${x + w},${y + tr}` +
      ` V${y + h - br} A${br},${br} 0 0 1 ${x + w - br},${y + h}` +
      ` H${x + bl} A${bl},${bl} 0 0 1 ${x},${y + h - bl}` +
      ` V${y + tl} A${tl},${tl} 0 0 1 ${x + tl},${y} Z`;
  }

  function fontFamily(cs) {
    const f = cs.fontFamily || "";
    if (/Plex Mono/i.test(f)) return "IBM Plex Mono";
    if (/Plex Sans/i.test(f)) return "IBM Plex Sans";
    if (/Newsreader/i.test(f)) return "Newsreader";
    return f.split(",")[0].replace(/["']/g, "").trim() || "IBM Plex Sans";
  }

  // split a text node into its rendered lines using Range rects
  function lines(node) {
    const txt = node.nodeValue;
    if (!txt || !txt.trim()) return [];
    const r = document.createRange();
    const bounds = [];
    let start = 0, prevTop = null;
    for (let i = 1; i <= txt.length; i++) {
      r.setStart(node, i - 1); r.setEnd(node, i);
      const rects = r.getClientRects();
      if (!rects.length) continue;
      const rc = rects[0];
      if (prevTop === null) prevTop = rc.top;
      if (Math.abs(rc.top - prevTop) > 1.5) { bounds.push([start, i - 1]); start = i - 1; prevTop = rc.top; }
    }
    bounds.push([start, txt.length]);
    const out = [];
    for (let [s0, e0] of bounds) {
      while (s0 < e0 && /\s/.test(txt[s0])) s0++;
      while (e0 > s0 && /\s/.test(txt[e0 - 1])) e0--;
      if (e0 <= s0) continue;
      r.setStart(node, s0); r.setEnd(node, e0);
      out.push({ text: txt.slice(s0, e0), rect: r.getBoundingClientRect() });
    }
    return out;
  }

  function layerName(el, i) {
    const cls = (el.className && typeof el.className === "string" ? el.className : "").split(" ").filter(Boolean);
    const skip = { r: 1, c: 1, g: 1, ab: 1, ph: 1, lay: 1 };
    const useful = cls.filter((c) => !skip[c]);
    const base = useful.length ? useful.join("-") : el.tagName.toLowerCase();
    return base.replace(/[^A-Za-z0-9_-]/g, "") + "-" + i;
  }

  function exportBoard(ab, defsMarkup) {
    const prevT = ab.style.transform;
    ab.style.transform = "none";
    const base = ab.getBoundingClientRect();
    const W = Math.round(base.width), H = Math.round(base.height);
    const parts = [];
    const extraDefs = [];
    let n = 0;

    const walk = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      const rect = el.getBoundingClientRect();
      const x = +(rect.left - base.left).toFixed(2);
      const y = +(rect.top - base.top).toFixed(2);
      const w = +rect.width.toFixed(2);
      const h = +rect.height.toFixed(2);
      const op = parseFloat(cs.opacity);
      const opAttr = op < 1 ? ` opacity="${op}"` : "";

      if (el.tagName.toLowerCase() === "svg") {
        if (w > 0 && h > 0) {
          const vb = el.getAttribute("viewBox") || `0 0 ${w} ${h}`;
          const par = el.getAttribute("preserveAspectRatio") || "xMidYMid meet";
          parts.push(`<svg id="${esc(layerName(el, n++))}" x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${esc(vb)}" preserveAspectRatio="${esc(par)}"${opAttr}>${el.innerHTML}</svg>`);
        }
        return; // children handled by the serialized markup
      }

      if (w > 0 && h > 0) {
        const bg = toRGBA(cs.backgroundColor);
        const grad = parseGradient(cs.backgroundImage);
        const ring = insetRing(cs.boxShadow);
        const bw = parseFloat(cs.borderTopWidth) || 0;
        const bc = bw > 0 ? toRGBA(cs.borderTopColor) : null;
        const isDashed = cs.borderTopStyle === "dashed";
        if (bg || grad || ring || bc) {
          const r = radii(cs, w, h);
          let fill;
          if (grad) {
            const gid = "grad" + n + "-" + Math.round(x) + "-" + Math.round(y);
            extraDefs.push(`<linearGradient id="${gid}" x1="${grad.x1}" y1="${grad.y1}" x2="${grad.x2}" y2="${grad.y2}">` +
              grad.stops.map((st) => `<stop offset="${(st.off * 100).toFixed(1)}%" stop-color="${st.hex}"${st.a < 1 ? ` stop-opacity="${st.a.toFixed(3)}"` : ""}/>`).join("") +
              `</linearGradient>`);
            fill = `fill="url(#${gid})"`;
          } else {
            fill = bg ? `fill="${bg.hex}"${bg.a < 1 ? ` fill-opacity="${bg.a.toFixed(3)}"` : ""}` : `fill="none"`;
          }
          let stroke = "";
          if (bc) stroke = ` stroke="${bc.hex}"${bc.a < 1 ? ` stroke-opacity="${bc.a.toFixed(3)}"` : ""} stroke-width="${bw}"${isDashed ? ' stroke-dasharray="4 3"' : ""}`;
          else if (ring) stroke = ` stroke="${ring.hex}"${ring.a < 1 ? ` stroke-opacity="${ring.a.toFixed(3)}"` : ""} stroke-width="${ring.w}"`;
          const id = esc(layerName(el, n++));
          if (r.uniform !== null) {
            parts.push(`<rect id="${id}" x="${x}" y="${y}" width="${w}" height="${h}"${r.uniform ? ` rx="${Math.min(r.uniform, w / 2, h / 2)}"` : ""} ${fill}${stroke}${opAttr}/>`);
          } else {
            parts.push(`<path id="${id}" d="${roundedPath(x, y, w, h, r)}" ${fill}${stroke}${opAttr}/>`);
          }
        }
      }

      for (const node of el.childNodes) {
        if (node.nodeType === 3) {
          const ls = lines(node);
          if (!ls.length) continue;
          const col = toRGBA(cs.color) || { hex: "#000000", a: 1 };
          const fs = parseFloat(cs.fontSize);
          const fam = fontFamily(cs);
          const fw = cs.fontWeight;
          const ls2 = parseFloat(cs.letterSpacing);
          const lsAttr = !isNaN(ls2) && ls2 !== 0 ? ` letter-spacing="${ls2}"` : "";
          const tt = cs.textTransform === "uppercase";
          for (const l of ls) {
            const tx = +(l.rect.left - base.left).toFixed(2);
            const ty = +(l.rect.top - base.top + fs * 0.79 + (l.rect.height - fs * 1.16) / 2).toFixed(2);
            const content = tt ? l.text.toUpperCase() : l.text;
            parts.push(`<text id="${esc(layerName(el, n++))}" x="${tx}" y="${ty}" font-family="${esc(fam)}" font-size="${fs}" font-weight="${fw}" fill="${col.hex}"${col.a < 1 ? ` fill-opacity="${col.a.toFixed(3)}"` : ""}${lsAttr}${opAttr} xml:space="preserve">${esc(content.replace(/\s+/g, " "))}</text>`);
          }
        } else if (node.nodeType === 1) {
          walk(node);
        }
      }
    };

    walk(ab);
    ab.style.transform = prevT;

    const svg = `<svg xmlns="${NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<defs>${defsMarkup}${extraDefs.join("")}</defs>\n${parts.join("\n")}\n</svg>`;
    return { w: W, h: H, svg };
  }

  const defsEl = document.querySelector("svg defs");
  const defsMarkup = defsEl ? defsEl.innerHTML : "";

  const out = [];
  const units = document.querySelectorAll(".unit, section.plate-block");
  units.forEach((u, i) => {
    const ab = u.querySelector(".ab");
    if (!ab) return;
    const idEl = u.querySelector(".ucap .id, .cap .id");
    const h3 = u.querySelector(".ucap h3, .cap h2");
    const id = idEl ? idEl.textContent.trim() : "S" + (i + 1);
    const title = h3 ? h3.textContent.trim() : "screen";
    const name = (id + "-" + title).replace(/[^A-Za-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
    const r = exportBoard(ab, defsMarkup);
    out.push({ name, w: r.w, h: r.h, svg: r.svg });
  });
  return JSON.stringify(out);
})();
