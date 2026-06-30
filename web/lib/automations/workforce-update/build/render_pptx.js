#!/usr/bin/env node
/**
 * Agent Workforce Update deck (16:9) — Moyne Roberts house style.
 * White / navy / orange / blue, blue wave motif, persona avatars.
 * Reads the same JSON as the one-pager. Bottom-right kept clear for a presenter head-blob.
 * Usage: node render_pptx.js <content.json> <out.pptx> [logo.png]
 */
const fs = require("fs");
const path = require("path");
const PptxGenJS = require("pptxgenjs");

const [, , SRC, OUT, LOGO_ARG] = process.argv;
const d = JSON.parse(fs.readFileSync(SRC, "utf8"));
const WF = path.resolve(__dirname, "..");
const LOGO = LOGO_ARG || path.resolve(WF, "../../../public/brand/moyne-roberts-logo.png");
const hasLogo = fs.existsSync(LOGO);
const WAVE = path.resolve(WF, "assets/wave.png");
const AV = f => path.resolve(WF, "assets/avatars", f);

const INK = "14253B", CHAR = "46526A", ORANGE = "E8531A", BLUE = "1668C7",
      SLATE = "5B6B8C", GREY = "9AA3B2", PAPER = "FFFFFF", PANEL = "EEF1F7",
      MUTED = "6B7589", HAIR = "E2E6EE", WHITE = "FFFFFF", DARK = "14253B", LIGHTC = "C9D3E0";
const F = "Lato";

const p = new PptxGenJS();
p.defineLayout({ name: "W", width: 13.333, height: 7.5 });
p.layout = "W";
const W = 13.333, H = 7.5, MX = 0.75;

function header(s, title, sub) {
  s.background = { color: PAPER };
  s.addText(title, { x: MX, y: 0.5, w: 9.5, h: 0.7, fontFace: F, fontSize: 28, color: INK, bold: true });
  if (sub) s.addText(sub.toUpperCase(), { x: W - MX - 5.5, y: 0.7, w: 5.5, h: 0.4, align: "right",
    fontFace: F, fontSize: 11, color: MUTED, bold: true, charSpacing: 1 });
  s.addShape(p.ShapeType.line, { x: MX, y: 1.32, w: W - 2 * MX, h: 0, line: { color: HAIR, width: 1 } });
}

// 1. Cover
let s = p.addSlide();
s.background = { color: PAPER };
s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.16, fill: { color: ORANGE } });
if (hasLogo) s.addImage({ path: LOGO, x: MX, y: 0.6, w: 2.6, h: 2.6 / 6.0 });
s.addText(`${d.title.toUpperCase()}   ·   ${d.period_label} · ${d.date_human}`,
  { x: W - MX - 7, y: 0.7, w: 7, h: 0.4, align: "right", fontFace: F, fontSize: 12, color: MUTED, bold: true, charSpacing: 1 });
s.addText(d.tagline, { x: MX, y: 2.0, w: 10.6, h: 2.2, fontFace: F, fontSize: 46, color: INK, bold: true, lineSpacingMultiple: 1.02 });
s.addShape(p.ShapeType.line, { x: MX, y: 4.35, w: 3.2, h: 0, line: { color: ORANGE, width: 3 } });
s.addText(d.intro, { x: MX, y: 4.6, w: 10.0, h: 1.5, fontFace: F, fontSize: 15, color: CHAR, lineSpacingMultiple: 1.25, valign: "top" });
s.addText(d.brand_line, { x: MX, y: 6.35, w: 8, h: 0.4, fontFace: F, fontSize: 12, color: INK, bold: true });
if (fs.existsSync(WAVE)) s.addImage({ path: WAVE, x: 0, y: 6.75, w: W, h: 0.75 });

// 2. Where we are today (three modes)
s = p.addSlide();
header(s, "Where we are today");
const modes = [
  { lab: "LIVE", col: BLUE, txt: d.status_live },
  { lab: "DRY-RUN", col: ORANGE, txt: d.status_dryrun },
  { lab: "SHADOW", col: SLATE, txt: d.status_shadow },
];
const c3g = 0.4, c3w = (W - 2 * MX - 2 * c3g) / 3, c3y = 2.2, c3h = 2.9;
modes.forEach((m, i) => {
  const x = MX + i * (c3w + c3g);
  s.addShape(p.ShapeType.rect, { x, y: c3y, w: c3w, h: c3h, fill: { color: WHITE }, line: { color: HAIR, width: 1 } });
  s.addShape(p.ShapeType.rect, { x, y: c3y, w: 0.1, h: c3h, fill: { color: m.col } });
  s.addText([{ text: "● ", options: { color: m.col } }, { text: m.lab, options: { color: m.col } }],
    { x: x + 0.35, y: c3y + 0.35, w: c3w - 0.7, h: 0.45, fontFace: F, fontSize: 18, bold: true, charSpacing: 1 });
  s.addText(m.txt, { x: x + 0.35, y: c3y + 1.0, w: c3w - 0.7, h: 1.7, fontFace: F, fontSize: 15, color: CHAR, valign: "top", lineSpacingMultiple: 1.2 });
});

// 3. Pipeline + personas
s = p.addSlide();
header(s, d.pipeline.title);
s.addText(d.pipeline.intro, { x: MX, y: 1.55, w: W - 2 * MX, h: 0.6, fontFace: F, fontSize: 14.5, color: CHAR, lineSpacingMultiple: 1.15 });
const ps = d.pipeline.steps, pn = ps.length, pcw = (W - 2 * MX) / pn, av = 1.15, avY = 2.55;
for (let i = 0; i < pn - 1; i++) {
  const x1 = MX + i * pcw + pcw / 2, x2 = MX + (i + 1) * pcw + pcw / 2;
  const lastSeg = (i === pn - 2);
  s.addShape(p.ShapeType.line, { x: x1, y: avY + av / 2, w: x2 - x1, h: 0,
    line: lastSeg ? { color: GREY, width: 2, dashType: "dash" } : { color: BLUE, width: 2 } });
}
ps.forEach((st, i) => {
  const cx = MX + i * pcw + pcw / 2, bx = MX + i * pcw + 0.1, bw = pcw - 0.2;
  const ax = cx - av / 2, last = (i === pn - 1);
  s.addShape(p.ShapeType.ellipse, { x: ax - 0.04, y: avY - 0.04, w: av + 0.08, h: av + 0.08, fill: { color: PAPER }, line: { color: last ? GREY : HAIR, width: 1.5 } });
  if (fs.existsSync(AV(st.avatar))) s.addImage({ path: AV(st.avatar), x: ax, y: avY, w: av, h: av, rounding: true });
  s.addText(st.persona, { x: bx, y: avY + av + 0.18, w: bw, h: 0.4, align: "center", fontFace: F, fontSize: 18, color: INK, bold: true });
  s.addText(st.persona_title, { x: bx, y: avY + av + 0.62, w: bw, h: 0.34, align: "center", fontFace: F, fontSize: 13, color: BLUE, italic: true });
  s.addText(st.title.toUpperCase(), { x: bx, y: avY + av + 1.0, w: bw, h: 0.3, align: "center", fontFace: F, fontSize: 10.5, color: MUTED, bold: true, charSpacing: 0.5 });
  if (last) s.addText("NOT YET", { x: bx, y: avY + av + 1.34, w: bw, h: 0.28, align: "center", fontFace: F, fontSize: 10, color: GREY, bold: true, charSpacing: 1.5 });
});
const nt = d.pipeline.new_teammate;
if (nt) {
  const ny = 5.55, nw = 8.6;
  s.addShape(p.ShapeType.rect, { x: MX, y: ny, w: nw, h: 1.05, fill: { color: PANEL } });
  s.addShape(p.ShapeType.rect, { x: MX, y: ny, w: 0.09, h: 1.05, fill: { color: ORANGE } });
  if (fs.existsSync(AV(nt.avatar))) s.addImage({ path: AV(nt.avatar), x: MX + 0.25, y: ny + 0.2, w: 0.65, h: 0.65, rounding: true });
  s.addText("NEW THIS MONTH", { x: MX + 1.1, y: ny + 0.18, w: nw - 1.3, h: 0.28, fontFace: F, fontSize: 10, color: ORANGE, bold: true, charSpacing: 1 });
  s.addText([{ text: nt.persona + ", ", options: { bold: true, color: INK } }, { text: nt.persona_title, options: { italic: true, color: BLUE } },
    { text: "  —  " + nt.blurb, options: { color: CHAR } }],
    { x: MX + 1.1, y: ny + 0.45, w: nw - 1.3, h: 0.5, fontFace: F, fontSize: 14, valign: "middle" });
}
s.addText(d.pipeline.persona_note, { x: MX, y: 7.0, w: W - 2 * MX, h: 0.3, fontFace: F, fontSize: 9.5, color: MUTED, italic: true });

// 4. Matrix
s = p.addSlide();
header(s, d.matrix.title, d.matrix.caption);
const stCol = { live: BLUE, dry: ORANGE, shadow: SLATE, off: GREY };
let lgx = MX;
d.matrix.legend.forEach(l => {
  s.addShape(p.ShapeType.ellipse, { x: lgx, y: 1.5, w: 0.17, h: 0.17, fill: { color: stCol[l.key] } });
  s.addText(l.label, { x: lgx + 0.22, y: 1.42, w: 2.5, h: 0.32, fontFace: F, fontSize: 10.5, color: CHAR, valign: "middle" });
  lgx += 0.22 + 2.45;
});
const sym = { live: "✓", dry: "◐", shadow: "○", off: "–" };
const cellFill = { live: BLUE, dry: ORANGE, shadow: SLATE, off: "EEF1F7" };
const cellColor = { live: WHITE, dry: WHITE, shadow: WHITE, off: "9AA3B2" };
const headRow = [{ text: "Mailbox", options: { fill: INK, color: WHITE, bold: true, align: "left", valign: "middle", fontSize: 11 } }]
  .concat(d.matrix.columns.map(c => ({ text: c, options: { fill: INK, color: WHITE, bold: true, align: "center", valign: "middle", fontSize: 8.5 } })));
const trows = [headRow];
d.matrix.rows.forEach((r, ri) => {
  const rf = ri % 2 ? WHITE : "F4F6FA";
  const row = [{ text: r.mailbox, options: { fill: rf, color: INK, align: "left", valign: "middle", fontSize: 10, bold: true } }];
  r.cells.forEach(c => row.push({ text: sym[c], options: { fill: cellFill[c], color: cellColor[c], align: "center", valign: "middle", fontSize: 12, bold: true } }));
  trows.push(row);
});
const ncolM = d.matrix.columns.length, mbColW = 3.0, capColW = (W - 2 * MX - mbColW) / ncolM;
s.addTable(trows, { x: MX, y: 1.9, w: W - 2 * MX, colW: [mbColW].concat(Array(ncolM).fill(capColW)),
  rowH: [0.5].concat(Array(d.matrix.rows.length).fill(0.34)), border: { type: "solid", color: HAIR, pt: 1 }, valign: "middle", fontFace: F, autoPage: false });
s.addText(d.matrix.note, { x: MX, y: 7.02, w: W - 2 * MX, h: 0.3, fontFace: F, fontSize: 9, color: MUTED, italic: true });

// 5. What's new (titles)
s = p.addSlide();
header(s, "What's new");
d.shipped.slice(0, 4).forEach((it, i) => {
  const y = 2.15 + i * 1.05;
  s.addShape(p.ShapeType.ellipse, { x: MX, y: y + 0.02, w: 0.5, h: 0.5, fill: { color: "E7F0FB" } });
  s.addText("✓", { x: MX, y: y + 0.02, w: 0.5, h: 0.5, align: "center", valign: "middle", fontFace: F, fontSize: 18, color: BLUE, bold: true });
  s.addText(it.title, { x: MX + 0.75, y, w: 9.0, h: 0.55, fontFace: F, fontSize: 20, color: INK, bold: true, valign: "middle" });
});

// 9. What's next (titles)
s = p.addSlide();
header(s, "What's next", "in development");
d.roadmap.slice(0, 3).forEach((r, i) => {
  const y = 2.2 + i * 1.05;
  s.addText("→", { x: MX, y, w: 0.55, h: 0.55, fontFace: F, fontSize: 22, color: ORANGE, bold: true, valign: "middle" });
  s.addText(r.title, { x: MX + 0.7, y, w: 9.0, h: 0.55, fontFace: F, fontSize: 20, color: INK, bold: true, valign: "middle" });
});
s.addText(d.roadmap_note, { x: MX, y: 5.9, w: W - 2 * MX, h: 0.4, fontFace: F, fontSize: 11, color: MUTED, italic: true });

// 10. Closing (dark)
s = p.addSlide();
s.background = { color: DARK };
s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.16, fill: { color: ORANGE } });
s.addShape(p.ShapeType.line, { x: MX, y: 2.5, w: 3.2, h: 0, line: { color: BLUE, width: 3 } });
s.addText("Questions or feedback?", { x: MX, y: 2.7, w: 11, h: 1.0, fontFace: F, fontSize: 42, color: WHITE, bold: true });
s.addText("Everything runs in shadow mode unless stated otherwise — no changes without your sign-off.",
  { x: MX, y: 3.8, w: 10.5, h: 0.9, fontFace: F, fontSize: 17, color: LIGHTC, lineSpacingMultiple: 1.2 });
s.addText("Moyne Roberts", { x: MX, y: 5.2, w: 8, h: 0.5, fontFace: F, fontSize: 18, color: WHITE, bold: true });
s.addText(d.brand_line + "  ·  MR Automations", { x: MX, y: 5.65, w: 10, h: 0.4, fontFace: F, fontSize: 12, color: GREY });
if (fs.existsSync(WAVE)) s.addImage({ path: WAVE, x: 0, y: 6.6, w: W, h: 0.9 });

p.writeFile({ fileName: OUT }).then(f => console.log("wrote", f));
