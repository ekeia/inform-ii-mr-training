/* fx3d.js — 3D demonstration window and scan guide for the MR panel (team request, 2026-11-06)
 * 1) Demo window: a small stage beside the MR panel where simple 3D models (meter, test strip, control bottle) act out
 *    the current step, from QC 04 on. Each step is a short looping animation with a caption taken from the course text.
 * 2) Scan guide: a card shown once when a step moves from a tap to its first screen scan (QC 01: after "Done", before
 *    scanning the Operator ID): it shows how to let the headset see the meter screen, then shrinks into the scan card.
 * Models are plain procedural shapes — no brand marks. Inside a model the unit is the centimetre; the stage is in metres.
 * Layout follows the training videos: strip port at the meter's top end, strip goes in contacts first with the grey dosing
 * end outside; the control drop touches the strip's front edge (not its top); the barcode scanner is at the top end.
 */
(() => {
'use strict';
const T = window.THREE; if (!T) return;
const lang = () => (window.QC && window.QC.S && window.QC.S.lang) || 'en';
const tx = (a, b) => lang() === 'zh' ? a : b;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const io = k => { k = clamp01(k); return k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };   // ease in-out
const seg = (t, a, b) => io((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const FONT = '"Noto Sans SC","IBM Plex Sans","PingFang SC","Microsoft YaHei",sans-serif';

function rrect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function wrap(x, text, maxW) { const out = []; let cur = ''; for (const tk of String(text).match(/[⺀-鿿＀-￯　-〿]|[^\s⺀-鿿＀-￯　-〿]+|\s+/g) || []) { if (x.measureText(cur + tk).width > maxW && cur.trim()) { out.push(cur.trim()); cur = tk.trim() ? tk : ''; } else cur += tk; } if (cur.trim()) out.push(cur.trim()); return out; }
function canvasTex(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new T.CanvasTexture(c); t.anisotropy = 8; return { c, x: c.getContext('2d'), t }; }
function roundedShape(w, h, r) {
  const s = new T.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
/* a rounded slab w × h × d centred on the origin (front face +z) */
function slabGeo(w, h, d, r) {
  const b = Math.min(r * .45, d * .3), g = new T.ExtrudeGeometry(roundedShape(w - 2 * b, h - 2 * b, Math.max(.05, r - b)), { depth: d - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 14 });
  g.translate(0, 0, -(d - 2 * b) / 2); return g;
}
const std = (color, o = {}) => new T.MeshStandardMaterial(Object.assign({ color, roughness: .45, metalness: 0 }, o));

/* ---------- meter: white shell, purple face, screen (canvas), strip port + scanner window on the top end ---------- */
const MW = 8, MH = 18, MD = 2.8;
const BARBTN = { x: 212, y: 44, w: 96, h: 34 };   // the barcode (scan) button at the top right of the Operator ID and lot pages
function drawScreen(x, w, h, k, ph) {
  x.fillStyle = '#f6f8ff'; x.fillRect(0, 0, w, h);
  const title = k.startsWith('opid') ? 'Operator ID' : k === 'menu' ? 'Main Menu' : 'Control Test';
  x.fillStyle = '#2c4fae'; x.fillRect(0, 0, w, 36); x.fillStyle = '#ffffff'; x.font = `600 21px ${FONT}`; x.fillText(title, 12, 25);
  x.fillStyle = '#cdd9f3'; x.fillRect(0, h - 26, w, 26);
  const cx = w / 2, ink = '#1d2433';
  const stripIcon = (sy, len) => { x.fillStyle = '#ffffff'; x.strokeStyle = ink; x.lineWidth = 3; x.fillRect(cx - 9, sy, 18, len); x.strokeRect(cx - 9, sy, 18, len); x.fillStyle = ink; x.fillRect(cx - 9, sy, 18, 10); };
  const meterTop = y0 => { x.strokeStyle = ink; x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 70, y0 + 12); x.quadraticCurveTo(cx, y0 - 10, cx + 70, y0 + 12); x.stroke(); };
  const barBtn = (active, hint) => {   // hint: a pulsing ring says "tap here"; active: the scanner is on (the button turns dark, as on the meter)
    const b = BARBTN;
    if (hint) { x.strokeStyle = `rgba(255,150,0,${.55 + .45 * Math.sin(ph * Math.PI * 2)})`; x.lineWidth = 6; rrect(x, b.x - 8, b.y - 8, b.w + 16, b.h + 16, 15); x.stroke(); }
    rrect(x, b.x, b.y, b.w, b.h, 11); x.fillStyle = active ? '#1d2a5c' : '#ffffff'; x.fill(); x.strokeStyle = '#33468f'; x.lineWidth = 2.5; x.stroke();
    x.fillStyle = active ? '#ffffff' : '#1d2433'; for (let i = 0; i < 15; i++) x.fillRect(b.x + 14 + i * 4.6, b.y + 8, i % 3 ? 2 : 3, 18);
  };
  if (k === 'opid' || k === 'opid_scan') {
    x.strokeStyle = '#9aa6c4'; x.lineWidth = 2; rrect(x, 12, 46, 186, 30, 6); x.stroke(); barBtn(k === 'opid_scan', k === 'opid');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', 'A-G']; x.font = `600 16px ${FONT}`; x.textAlign = 'center';
    keys.forEach((kk, i) => { const bx = 26 + (i % 3) * 96, by = 90 + Math.floor(i / 3) * 34; rrect(x, bx, by, 76, 26, 12); x.strokeStyle = '#33468f'; x.lineWidth = 2; x.stroke(); x.fillStyle = kk === '←' ? '#2c6fd6' : ink; x.fillText(kk, bx + 38, by + 19); });
    rrect(x, 18, 228, 96, 22, 10); x.stroke(); rrect(x, w - 114, 228, 96, 22, 10); x.stroke(); x.fillStyle = '#1e9a5e'; x.font = `800 18px ${FONT}`; x.fillText('✓', w - 66, 245); x.textAlign = 'left';
  } else if (k === 'menu') {
    ['Patient Test', 'Control Test', 'Review Results'].forEach((l, i) => { const by = 52 + i * 46; rrect(x, 16, by, w - 32, 36, 14); x.strokeStyle = '#33468f'; x.lineWidth = 2.5; x.stroke(); x.fillStyle = '#9aa6c4'; x.fillRect(28, by + 9, 30, 18); x.fillStyle = ink; x.font = `600 17px ${FONT}`; x.textAlign = 'center'; x.fillText(l, w / 2 + 18, by + 24); x.textAlign = 'left'; });
  } else if (k === 'lot' || k === 'lotscan' || k === 'lotok') {
    if (k !== 'lotok') barBtn(k === 'lotscan', k === 'lot');
    x.fillStyle = ink; x.font = `500 19px ${FONT}`; x.textAlign = 'center';
    x.fillText(k !== 'lotok' ? 'Use Control Lot' : 'Control Lot', cx, 120); x.fillText('60101084' + (k !== 'lotok' ? '?' : ''), cx, 146);
    if (k === 'lotok') { x.fillStyle = '#1e9a5e'; x.beginPath(); x.arc(cx, 196, 26, 0, 7); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx - 12, 196); x.lineTo(cx - 3, 206); x.lineTo(cx + 13, 186); x.stroke(); x.lineCap = 'butt'; }
    else for (const [i, s] of ['◀', '✕', '✓'].entries()) { const bx = 30 + i * 92; x.strokeStyle = '#33468f'; x.lineWidth = 2.5; rrect(x, bx, h - 72, 74, 38, 12); x.stroke(); x.fillStyle = i === 2 ? '#1e9a5e' : i === 1 ? '#c7352b' : '#33468f'; x.font = `700 22px ${FONT}`; x.fillText(s, bx + 37, h - 45); }
    x.textAlign = 'left';
  } else if (k === 'slot' || k === 'slotscan') {   // Use Strip Lot 672024? (QC 04, second half)
    barBtn(k === 'slotscan', k === 'slot');
    x.fillStyle = ink; x.font = `500 19px ${FONT}`; x.textAlign = 'center'; x.fillText('Use Strip Lot', cx, 120); x.fillText('672024?', cx, 146);
    for (const [i, s] of ['◀', '✕', '✓'].entries()) { const bx = 30 + i * 92; x.strokeStyle = '#33468f'; x.lineWidth = 2.5; rrect(x, bx, h - 72, 74, 38, 12); x.stroke(); x.fillStyle = i === 2 ? '#1e9a5e' : i === 1 ? '#c7352b' : '#33468f'; x.font = `700 22px ${FONT}`; x.fillText(s, bx + 37, h - 45); }
    x.textAlign = 'left';
  } else if (k === 'insert') {
    stripIcon(52, 92); meterTop(160);
    x.fillStyle = '#1fa25c'; const ay = 60 + (ph % 1) * 30; x.beginPath(); x.moveTo(cx + 40, ay); x.lineTo(cx + 60, ay); x.lineTo(cx + 60, ay + 30); x.lineTo(cx + 72, ay + 30); x.lineTo(cx + 50, ay + 52); x.lineTo(cx + 28, ay + 30); x.lineTo(cx + 40, ay + 30); x.closePath(); x.fill();
  } else if (k === 'wait') {
    x.strokeStyle = ink; x.lineWidth = 4; const y0 = 70; x.beginPath(); x.moveTo(cx - 30, y0); x.lineTo(cx + 30, y0); x.lineTo(cx - 30, y0 + 110); x.lineTo(cx + 30, y0 + 110); x.closePath(); x.stroke();
    x.fillStyle = '#e0a33a'; const f = (ph % 1); x.beginPath(); x.moveTo(cx - 24 * (1 - f), y0 + 6 + 44 * f); x.lineTo(cx + 24 * (1 - f), y0 + 6 + 44 * f); x.lineTo(cx, y0 + 52); x.fill(); x.beginPath(); x.moveTo(cx, y0 + 60); x.lineTo(cx + 24 * f, y0 + 104); x.lineTo(cx - 24 * f, y0 + 104); x.fill();
  } else if (k === 'drop') {
    stripIcon(118, 64); meterTop(196);
    x.fillStyle = '#2e8ea6'; x.save(); x.translate(cx - 34, 80); x.rotate(-.5); rrect(x, -34, -14, 56, 28, 6); x.fill(); x.fillRect(20, -6, 16, 12); x.restore();
    if (ph % 1 < .6) { x.fillStyle = '#2aa6e6'; x.beginPath(); x.arc(cx + 2, 102, 9, 0, 7); x.fill(); }
  } else if (k === 'result') {
    x.fillStyle = ink; x.font = `600 64px ${FONT}`; x.textAlign = 'center'; x.fillText('3.1', cx - 16, 150); x.font = `400 18px ${FONT}`; x.fillText('mmol/L', cx + 70, 150);
    x.strokeStyle = '#33468f'; x.lineWidth = 2.5; rrect(x, cx - 90, 176, 180, 34, 14); x.stroke(); x.fillStyle = '#33468f'; x.font = `500 19px ${FONT}`; x.fillText('Range', cx, 200); x.textAlign = 'left';
  }
}
function meter() {
  const g = new T.Group();
  g.add(new T.Mesh(slabGeo(MW, MH, MD, 2.4), std(0xf2f0f5, { roughness: .4 })));
  const face = new T.Mesh(new T.ShapeGeometry(roundedShape(MW - .9, MH - 1.2, 2.0), 14), std(0x7656b5, { roughness: .32 })); face.position.set(0, -.15, MD / 2 + .015); g.add(face);
  const rim = new T.Mesh(new T.ShapeGeometry(roundedShape(6.3, 5.5, .45), 8), std(0xfafafa, { roughness: .3 })); rim.position.set(0, 3.1, MD / 2 + .03); g.add(rim);
  const st = canvasTex(320, 280), screen = new T.Mesh(new T.PlaneGeometry(5.7, 4.9), new T.MeshBasicMaterial({ map: st.t })); screen.position.set(0, 3.1, MD / 2 + .045); g.add(screen);
  const band = new T.Mesh(new T.PlaneGeometry(2.4, .28), std(0xd9cdee)); band.position.set(0, -4.4, MD / 2 + .03); g.add(band);   // a plain label strip where the maker's name would be
  const key = new T.Mesh(new T.CircleGeometry(.55, 24), std(0xe9e2f6)); key.position.set(0, -6.6, MD / 2 + .03); g.add(key);
  const port = new T.Mesh(new T.BoxGeometry(1.5, .35, .42), std(0x15181d, { roughness: .7 })); port.position.set(0, MH / 2 - .1, .45); g.add(port);
  const winMat = std(0x4a0c14, { roughness: .15, emissive: 0x200004 }), win = new T.Mesh(new T.PlaneGeometry(2.0, .75), winMat); win.rotation.x = -Math.PI / 2; win.position.set(0, MH / 2 + .005, -.55); g.add(win);
  const btnAt = new T.Vector3((BARBTN.x + BARBTN.w / 2) / 320 * 5.7 - 2.85, 3.1 + (.5 - (BARBTN.y + BARBTN.h / 2) / 280) * 4.9, MD / 2 + .05);
  const scanAt = new T.Object3D(); scanAt.position.set(0, MH / 2 + .05, -.55); g.add(scanAt);
  const stripAt = new T.Object3D(); stripAt.position.set(0, MH / 2, .45); g.add(stripAt);
  let cur = '';
  g.userData = { scanAt, stripAt, btnAt, setScanner(k) { winMat.emissive.setRGB(.12 + .88 * k, .02 + .1 * k, .02 + .06 * k); }, setScreen(k, ph = 0) { const key = k + ':' + (k === 'insert' || k === 'wait' || k === 'opid' || k === 'lot' || k === 'slot' ? Math.floor(ph * 12) : k === 'drop' ? (ph % 1 < .6 ? 1 : 0) : 0); if (key === cur) return; cur = key; drawScreen(st.x, 320, 280, k, ph); st.t.needsUpdate = true; } };
  g.userData.setScreen('lot'); return g;
}

/* ---------- test strip: lies in x–y, printed face +z; contacts at +x (go into the port), grey dosing end at −x ---------- */
const SL = 4.7, SW = 1.0, ST = .07;
function strip() {
  const g = new T.Group(), tt = canvasTex(470, 100), x = tt.x;
  x.fillStyle = '#fbfbfa'; x.fillRect(0, 0, 470, 100);
  x.fillStyle = '#9aa0a8'; x.fillRect(0, 0, 84, 100); x.fillStyle = '#e8c43a'; x.fillRect(12, 34, 36, 32);   // grey dosing end with its window
  x.fillStyle = '#c3c7cc'; for (let i = 0; i < 3; i++) x.fillRect(110, 22 + i * 22, 170, 11);   // printed text (shown as plain bars)
  x.fillStyle = '#4a4f57'; x.lineWidth = 5; x.strokeStyle = '#4a4f57'; for (let i = 0; i < 2; i++) { x.beginPath(); x.moveTo(300 + i * 26, 30); x.lineTo(318 + i * 26, 50); x.lineTo(300 + i * 26, 70); x.stroke(); }   // arrows towards the contacts
  x.fillStyle = '#c99a3c'; for (let i = 0; i < 4; i++) x.fillRect(372, 10 + i * 22, 98, 12);   // gold contacts
  const side = std(0xf2f2f0), mats = [side, side, side, side, std(0xffffff, { map: tt.t, roughness: .55 }), side];
  g.add(new T.Mesh(new T.BoxGeometry(SL, SW, ST), mats));
  // the drawn-in sample: a blue film growing over the dosing window
  const fill = new T.Mesh(new T.PlaneGeometry(1, SW * .32), new T.MeshBasicMaterial({ color: 0x2f8de0, transparent: true, opacity: .9 })); fill.position.set(-SL / 2, 0, ST / 2 + .006); fill.visible = false; g.add(fill);
  g.userData = { setFill(k) { fill.visible = k > 0; const len = .9 * k; fill.scale.x = Math.max(.001, len); fill.position.x = -SL / 2 + .1 + len / 2; } };
  return g;
}

/* ---------- control bottle: dark blue body, white label (lot / expiry / barcode), white dropper tip, cap ---------- */
const BR = .575;   // bottle radius (half of the first draft: the team found it too fat)
function bottle() {
  const g = new T.Group(), lt = canvasTex(512, 420), x = lt.x;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 420);
  // the label wraps round the bottle; its lines run along the bottle (as on the real control bottle), centred on the front (u = .5)
  x.save(); x.translate(256, 210); x.rotate(-Math.PI / 2); x.fillStyle = '#1d2433'; x.textAlign = 'center';
  x.font = `700 40px ${FONT}`; x.fillText('LOT 60101084', 0, -34); x.font = `600 36px ${FONT}`; x.fillText('EXP 2027-09', 0, 10);
  for (let i = 0; i < 44; i++) x.fillRect(-150 + i * 6.8, 26, i % 4 === 0 ? 4 : i % 3 ? 2.2 : 3.2, 34);
  x.fillStyle = '#2c3f99'; x.font = `800 44px ${FONT}`; x.fillText('2', 170, -30); x.restore();
  const body = new T.Mesh(new T.CylinderGeometry(BR, BR, 3.4, 32), std(0x24378e, { roughness: .28 })); body.position.y = 1.7; g.add(body);
  const label = new T.Mesh(new T.CylinderGeometry(BR + .012, BR + .012, 2.3, 40, 1, true, Math.PI, Math.PI * 2), std(0xffffff, { map: lt.t, roughness: .5 })); label.position.y = 1.65; g.add(label);
  const white = std(0xf3f5f7, { roughness: .28 });
  const shoulder = new T.Mesh(new T.CylinderGeometry(BR * .54, BR, .7, 32), white); shoulder.position.y = 3.75; g.add(shoulder);
  const nozzle = new T.Mesh(new T.CylinderGeometry(.065, BR * .42, 1.3, 24), white); nozzle.position.y = 4.75; g.add(nozzle);
  const cap = new T.Mesh(new T.CylinderGeometry(BR * .68, BR * .7, 1.7, 32), std(0xfafafa, { roughness: .35 })); cap.position.y = 4.85; g.add(cap);
  const tip = new T.Object3D(); tip.position.y = 5.42; g.add(tip);
  g.userData = { tip, cap };
  return g;
}
/* ---------- strip vial: grey tube, dark cap, wrap-round label (TEST STRIPS / lot / barcode) ---------- */
const VR = 1.0;
function vial() {
  const g = new T.Group(), lt = canvasTex(512, 300), x = lt.x;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 300); x.fillStyle = '#2c4fae'; x.fillRect(0, 0, 512, 48);
  x.textAlign = 'center'; x.fillStyle = '#ffffff'; x.font = `800 30px ${FONT}`; x.fillText('TEST STRIPS', 256, 35);
  x.fillStyle = '#1d2433'; x.font = `700 34px ${FONT}`; x.fillText('LOT 672024', 256, 100); x.font = `600 27px ${FONT}`; x.fillText('EXP 2027-03', 256, 138);
  for (let i = 0; i < 44; i++) x.fillRect(106 + i * 6.8, 164, i % 4 === 0 ? 4 : i % 3 ? 2.2 : 3.2, 76);
  const tube = new T.Mesh(new T.CylinderGeometry(VR, VR, 3.6, 36), std(0xe6e8ec, { roughness: .4 })); tube.position.y = 1.8; g.add(tube);
  const label = new T.Mesh(new T.CylinderGeometry(VR + .012, VR + .012, 2.2, 44, 1, true, Math.PI, Math.PI * 2), std(0xffffff, { map: lt.t, roughness: .5 })); label.position.y = 1.75; g.add(label);
  const cap = new T.Mesh(new T.CylinderGeometry(VR * 1.05, VR * 1.05, 1.0, 36), std(0x3a414b, { roughness: .45 })); cap.position.y = 4.1; g.add(cap);
  const code = new T.Object3D(); code.position.set(0, 1.75 - (202 - 150) / 300 * 2.2, VR + .02); g.add(code);   // barcode centre on the front of the label
  g.userData = { code }; return g;
}
const dropMat = () => new T.MeshStandardMaterial({ color: 0x3d8fff, roughness: .06, metalness: .05, transparent: true, opacity: .88 });

/* ---------- gloved fingertip (tip at the origin, +y towards the hand) ---------- */
function finger() {
  const g = new T.Group(), m = std(0x4a8fdc, { roughness: .6 });
  const shaft = new T.Mesh(new T.CylinderGeometry(.62, .74, 4.4, 22), m); shaft.position.y = .62 + 2.2; g.add(shaft);
  const tip = new T.Mesh(new T.SphereGeometry(.62, 22, 16), m); tip.position.y = .62; g.add(tip);
  return g;
}
/* ---------- staff ID badge (8.6 × 5.4 cm) with its barcode; face +z ---------- */
function badge() {
  const g = new T.Group(), ct = canvasTex(540, 340), x = ct.x;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 540, 340); x.fillStyle = '#1f7f88'; x.fillRect(0, 0, 540, 64);
  x.fillStyle = '#ffffff'; x.font = `700 30px ${FONT}`; x.fillText('STAFF ID', 26, 44);
  x.fillStyle = '#d6dde2'; rrect(x, 26, 86, 120, 150, 12); x.fill(); x.fillStyle = '#9fadb5'; x.beginPath(); x.arc(86, 140, 30, 0, 7); x.fill(); x.beginPath(); x.ellipse(86, 220, 46, 34, 0, Math.PI, 0); x.fill();
  x.fillStyle = '#b9c3c9'; x.fillRect(172, 98, 220, 22); x.fillRect(172, 136, 160, 18);
  x.fillStyle = '#111111'; for (let i = 0; i < 58; i++) x.fillRect(172 + i * 5.6, 196, i % 4 === 0 ? 4 : i % 3 ? 2 : 3, 96);
  const side = std(0xf4f4f4), mats = [side, side, side, side, std(0xffffff, { map: ct.t, roughness: .45 }), side];
  g.add(new T.Mesh(new T.BoxGeometry(8.6, 5.4, .08), mats));
  const code = new T.Object3D(); code.position.set((172 + 162) / 540 * 8.6 - 4.3, (.5 - 244 / 340) * 5.4, .06); g.add(code);
  g.userData = { code }; return g;
}
const TAP_DIR = new T.Vector3(.42, -.5, .76).normalize();
/* the fingertip taps the barcode button: approach (a→b), press (b→c), back (c→d); returns 0…1 how pressed */
function tapButton(F, Mt, t, a, b, c, d) {
  const away = 3.4 * (1 - seg(t, a, b)) + 3.4 * seg(t, c, d), press = t > b && t < c ? 1 : 0;
  F.visible = t > a - .1 && t < d + .1; F.quaternion.setFromUnitVectors(_up, TAP_DIR);
  F.position.copy(Mt.userData.btnAt).addScaledVector(TAP_DIR, .02 + away - .12 * press); return press;
}

/* ---------- small helpers drawn in the stage ---------- */
function arrowSprite(color) {   // a flat arrow (pointing −y), for "push in"
  const s = new T.Shape(); s.moveTo(-.35, 1.2); s.lineTo(.35, 1.2); s.lineTo(.35, .1); s.lineTo(.8, .1); s.lineTo(0, -.9); s.lineTo(-.8, .1); s.lineTo(-.35, .1); s.closePath();
  return new T.Mesh(new T.ShapeGeometry(s), new T.MeshBasicMaterial({ color, transparent: true, opacity: .95 }));
}
function beam() {   // scan beam from the meter's top: a red fan with a sweeping line; local +y = towards the target
  const g = new T.Group(), s = new T.Shape(); s.moveTo(0, 0); s.lineTo(-.5, 1); s.lineTo(.5, 1); s.closePath();
  const fan = new T.Mesh(new T.ShapeGeometry(s), new T.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: .22, depthWrite: false, side: T.DoubleSide })); g.add(fan);
  const line = new T.Mesh(new T.PlaneGeometry(1, .035), new T.MeshBasicMaterial({ color: 0xff5146, transparent: true, opacity: .95, depthWrite: false, side: T.DoubleSide })); line.position.y = 1; g.add(line);
  g.userData = { fan, line }; return g;
}
const _v = new T.Vector3(), _w = new T.Vector3(), _up = new T.Vector3(0, 1, 0);
function aimBeam(b, from, to, width, sweep) {
  b.position.copy(from); _v.copy(to).sub(from); const len = _v.length(); b.quaternion.setFromUnitVectors(_up, _v.normalize());
  b.scale.set(width, len, 1); b.userData.line.position.x = (sweep - .5) * .9; b.userData.line.scale.x = .12;
}

/* ---------- the steps: layout + a looping animation + caption from the course text ---------- */
const INVERT_STEPS = () => [tx('仪器倒过来', 'Turn upside down'), tx('从下方插入试纸', 'Insert from below'), tx('从下往上挤一滴', 'Squeeze a drop up')];
const LOT_STEPS = kind => () => [tx('点条码图标', 'Tap the barcode icon'), kind === 'ctl' ? tx('扫质控液瓶', 'Scan the control bottle') : tx('扫试纸瓶', 'Scan the strip vial'), kind === 'ctl' ? tx('出现 Use Strip Lot', 'Use Strip Lot shows') : tx('出现插入箭头', 'Insert arrow shows')];
/* scan one lot: the bottle (QC 04) or the strip vial (QC 05) turns in, tap the barcode icon, scan its label, the next page shows */
function lotScene(kind) {
  const ctl = kind === 'ctl';
  return { period: 5.8, steps: LOT_STEPS(kind),
    title: () => ctl ? tx('确认或扫描质控液批号', 'Confirm or scan the control lot') : tx('确认或扫描试纸批号', 'Confirm or scan the strip lot'),
    cap: () => ctl ? tx('在批次页点 ✓，或点右上角条码图标，用血糖仪顶端扫质控液瓶上的条码。', 'Tap ✓ on the lot page, or tap the barcode icon and scan the control bottle with the meter’s top end.')
      : tx('在 Use Strip Lot 页点 ✓，或点条码图标扫试纸瓶上的条码。', 'Tap ✓ on Use Strip Lot, or tap the barcode icon and scan the strip vial.'),
    phase: t => t < 2.1 ? { cur: 0, done: 0 } : t < 3.9 ? { cur: 1, done: 1 } : t < 5.5 ? { cur: 2, done: 2 } : { cur: -1, done: 3 },
    build(P) { P.meter.visible = P.finger.visible = true; P.bottle.visible = ctl; P.vial.visible = !ctl; P.bottle.userData.cap.visible = true; },
    update(P, t) {
      const O = ctl ? P.bottle : P.vial, Mt = P.meter, X = 6.2, Y = -6.3;
      O.visible = true; O.position.set(X, Y, 0); O.rotation.set(0, lerp(-1.3, -.05, seg(t, 0, .9)), 0); O.scale.setScalar(1.5);
      const near = seg(t, 2.1, 2.8) - seg(t, 5.0, 5.7);
      Mt.scale.setScalar(.66); Mt.rotation.set(.1, .2, -1.82); Mt.position.set(lerp(-8.4, -6.2, near), lerp(-1.3, -1.9, near), 0);
      tapButton(P.finger, Mt, t, .9, 1.45, 1.65, 2.1);
      Mt.userData.setScanner(t > 1.6 && t < 3.9 ? .65 + .35 * Math.sin(t * 18) : 0);
      const on = t > 2.8 && t < 3.9; P.beam.visible = on;
      if (on) { Mt.updateMatrixWorld(true); Mt.userData.scanAt.getWorldPosition(_w); P.root.worldToLocal(_w); const to = new T.Vector3();
        if (ctl) to.set(X, Y + 1.65 * 1.5, (BR + .02) * 1.5); else { O.updateMatrixWorld(true); O.userData.code.getWorldPosition(to); P.root.worldToLocal(to); }
        aimBeam(P.beam, _w, to, 2.6, (Math.sin(t * 9) + 1) / 2); }
      Mt.userData.setScreen(ctl ? (t < 1.6 ? 'lot' : t < 3.9 ? 'lotscan' : t < 4.6 ? 'lotok' : 'slot') : (t < 1.6 ? 'slot' : t < 3.9 ? 'slotscan' : 'insert'), t * 1.4);
    } };
}
const SCAN_STEPS = () => [tx('点右上角条码图标', 'Tap the barcode icon'), tx('扫描本人 ID 条码', 'Scan your ID barcode'), tx('出现 Main Menu', 'Main Menu = logged in')];
/* Operator ID login (QC 01 second small step, patient 02): tap the barcode icon at the top right → the scanner at the top end lights up → hold the ID barcode to it → Main Menu */
const loginScene = micro => ({ period: 6.6, micro, title: () => tx('用血糖仪扫描本人 ID 条码', 'Scan your ID with the meter'), steps: SCAN_STEPS,
  cap: () => tx('在 Operator ID 页点屏幕右上角的条码图标，再把本人 ID 条码对准血糖仪顶端。', 'Tap the barcode icon at the top right of the screen, then hold your ID barcode in front of the meter’s top end.'),
  phase: t => t < 1.6 ? { cur: 0, done: 0 } : t < 3.5 ? { cur: 1, done: 1 } : t < 5.4 ? { cur: 2, done: 2 } : { cur: -1, done: 3 },
  build(P) { P.meter.visible = P.badge.visible = P.finger.visible = true; },
  update(P, t) {
    const Mt = P.meter, Bd = P.badge, ms = .6, mx = -3.6, my = -1.3; Mt.scale.setScalar(ms); Mt.rotation.set(-.16, .3, 0); Mt.position.set(mx, my, 0);
    tapButton(P.finger, Mt, t, .45, 1.1, 1.35, 1.9);
    const scanning = t > 1.3 && t < 3.5; Mt.userData.setScanner(scanning ? .65 + .35 * Math.sin(t * 18) : 0);
    Mt.userData.setScreen(t < 1.3 ? 'opid' : t < 3.5 ? 'opid_scan' : t < 6.2 ? 'menu' : 'opid', t * 1.4);
    // the badge comes to the top end, barcode towards the scanner, and leaves after the beep
    const inK = seg(t, 1.7, 2.4) - seg(t, 4.4, 5.2); Bd.visible = inK > .01;
    Bd.scale.setScalar(.56); Bd.rotation.set(lerp(.3, .95, inK), lerp(-.6, -.3, inK), lerp(.4, .12, inK)); Bd.position.set(lerp(10.5, 3.0, inK), lerp(3.4, 5.3, inK), lerp(1, 2.4, inK));   // in and out from the right, below the step labels
    const on = t > 2.4 && t < 3.5; P.beam.visible = on;
    if (on) { Mt.updateMatrixWorld(true); Bd.updateMatrixWorld(true); Mt.userData.scanAt.getWorldPosition(_w); P.root.worldToLocal(_w); const to = new T.Vector3(); Bd.userData.code.getWorldPosition(to); P.root.worldToLocal(to); aimBeam(P.beam, _w, to, 2.8, (Math.sin(t * 9) + 1) / 2); }
    P.ring.visible = t > 3.5 && t < 4.3; if (P.ring.visible) { const k = (t - 3.5) / .8; P.ring.position.set(mx + .4, my + ms * 3.1, 2.2); P.ring.scale.setScalar(.8 + 2.6 * k); P.ring.material.opacity = 1 - k; }   // the beep
  } });
const SCENES = {
  'qc:1': loginScene('menu'),
  'patient:2': loginScene('scan'),
  // 11-09: control lot (QC 04) and strip lot (QC 05) are two steps again, one short scan each
  'qc:4': lotScene('ctl'),
  'qc:5': lotScene('strip'),
  'qc:6': { period: 5.4, title: () => tx('倒置血糖仪，从下方插入试纸', 'Insert the strip from below'), steps: INVERT_STEPS,
    cap: () => tx('先把血糖仪倒过来，再从下方把试纸（触点在前）往上插到底。', 'Hold the meter upside down, then push the strip up into the port from below, contacts first, all the way in.'),
    phase: t => t < 1.7 ? { cur: 0, done: 0 } : t < 3.3 ? { cur: 1, done: 1 } : { cur: -1, done: 2 },
    build(P) { P.meter.visible = P.strip.visible = P.arrow.visible = true; P.bottle.visible = false; },
    update(P, t) {
      const Mt = P.meter, S = P.strip, ms = .5, cy = 1.7, flip = seg(t, .4, 1.6) - seg(t, 4.8, 5.4);
      Mt.scale.setScalar(ms); Mt.rotation.set(-.12 * Math.sin(Math.PI * flip), .28 * Math.sin(Math.PI * flip), Math.PI * flip); Mt.position.set(-1.2, cy, 0);
      // strip under the (now downward) port, contacts towards it; slides up by 1.5 cm (strip coordinates are the meter's: +y = out of the top end)
      const show = seg(t, 1.6, 1.9) * (1 - seg(t, 4.7, 5.0)), k = seg(t, 1.9, 3.0);
      S.visible = show > .01; S.rotation.set(0, 0, -Math.PI / 2); S.position.set(0, MH / 2 + SL / 2 + lerp(2.6, -1.5, k), .45);
      S.traverse(o => { if (o.material) for (const m of [].concat(o.material)) { m.transparent = true; m.opacity = show; } });
      const sy = cy - ms * (MH / 2 + SL / 2 + lerp(2.6, -1.5, k));
      P.arrow.visible = t > 1.7 && t < 3.0; P.arrow.rotation.z = Math.PI; P.arrow.position.set(-1.2 + 1.5, sy, 1); P.arrow.scale.setScalar(.85); P.arrow.material.opacity = .95 * (1 - seg(t, 2.7, 3.0));
      P.turn.visible = t > .3 && t < 1.7; P.turn.scale.setScalar(1.45); P.turn.position.set(-1.2, cy, -2.5); P.turn.rotation.z = -Math.PI * flip * 1.2 + 1; P.turn.material.opacity = .55 * (1 - seg(t, 1.4, 1.7));
      Mt.userData.setScreen(t < 3.05 ? 'insert' : t < 3.8 ? 'wait' : 'drop', t < 3.05 ? t * .9 : t * 1.2);
    } },
  'qc:8': { period: 4.2, title: () => tx('混匀质控液', 'Mix the control'),
    cap: () => tx('按质控液说明书和医院流程混匀。', 'Mix as the control instructions and hospital procedure say.'),
    build(P) { P.bottle.visible = true; P.meter.visible = P.strip.visible = P.beam.visible = P.arrow.visible = false; P.bottle.userData.cap.visible = true; },
    update(P, t) {
      const B = P.bottle, a = Math.sin(Math.PI * clamp01(t / 1.5)) * (t < 1.5 ? 1 : 0) + Math.sin(Math.PI * clamp01((t - 1.7) / 1.5)) * (t > 1.7 && t < 3.2 ? 1 : 0);
      const sc = 2.1, hh = 2.85 * sc, rot = a * 2.9 * (Math.floor(t / 1.6) % 2 ? -1 : 1);
      B.scale.setScalar(sc); B.rotation.set(0, -.15, rot); B.position.set(Math.sin(rot) * hh, .8 - Math.cos(rot) * hh, 0);
      P.turn.visible = t < 3.2; P.turn.scale.setScalar(1.85); P.turn.position.set(0, .8, -2.5); P.turn.rotation.z = -t * 2.2; P.turn.material.opacity = .55 * (1 - seg(t, 2.9, 3.2));
    } },
  'qc:9': { period: 5.2, title: () => tx('从下往上挤一滴到试纸前端', 'Squeeze a drop up to the strip'), steps: INVERT_STEPS,
    cap: () => tx('血糖仪保持倒置；瓶子在下方轻轻挤出一滴，从下往上碰到试纸前端。', 'Meter still upside down: gently squeeze one drop and bring it up to touch the strip’s front edge.'),
    phase: t => t < 2.8 ? { cur: 2, done: 2 } : { cur: -1, done: 3 },
    build(P) { P.meter.visible = P.strip.visible = P.bottle.visible = P.drop.visible = P.arrow.visible = P.arrow2.visible = true; P.beam.visible = false; P.bottle.userData.cap.visible = false; },
    update(P, t) {
      const Mt = P.meter, S = P.strip, B = P.bottle, D = P.drop, ms = .4, cy = 2.55;
      Mt.scale.setScalar(ms); Mt.rotation.set(.1, .22, Math.PI); Mt.position.set(-.6, cy, 0);
      const drawn = seg(t, 2.2, 2.8) * (t < 4.6 ? 1 : 0);
      S.rotation.set(0, 0, -Math.PI / 2); S.position.set(0, MH / 2 + SL / 2 - 1.5, .45); S.userData.setFill(drawn);
      Mt.updateMatrixWorld(true);
      const front = new T.Vector3(-SL / 2, 0, 0); S.localToWorld(front); P.root.worldToLocal(front);   // the strip's front edge (its lowest point)
      // bottle upright below, tip up; squeeze → a drop sits on the tip → lift until the drop touches the front edge → lower again
      const bs = .72, sq = Math.sin(Math.PI * clamp01((t - .45) / .9)) * (t > .45 && t < 1.35 ? 1 : 0), up = seg(t, 1.4, 2.2) - seg(t, 3.0, 3.8);
      B.scale.set(bs * (1 - .12 * sq), bs, bs * (1 - .12 * sq)); B.rotation.set(0, -.35, 0);
      const r = .4 * seg(t, .5, 1.35) * (1 - drawn), touchTip = front.y - .02 - 2 * .4 * .92;   // tip height when the drop's top meets the edge
      B.position.set(front.x - .02, touchTip - 5.42 * bs - .7 * (1 - up), 0);
      B.updateMatrixWorld(true); const tip = new T.Vector3(); B.userData.tip.getWorldPosition(tip); P.root.worldToLocal(tip);
      D.visible = r > .01; D.scale.setScalar(Math.max(.01, r / .34)); D.position.set(tip.x, tip.y + r * .92, tip.z);
      // two small arrows press the bottle's sides while it is squeezed
      for (const [a, sgn] of [[P.arrow, 1], [P.arrow2, -1]]) { a.visible = t > .35 && t < 1.45; a.rotation.z = sgn * Math.PI / 2; a.scale.setScalar(.55); a.position.set(front.x - sgn * (BR * bs + 1.1 + .25 * sq), B.position.y + 1.7 * bs, 1); a.material.opacity = .95 * (1 - seg(t, 1.2, 1.45)); }
      Mt.userData.setScreen(drawn > .9 ? 'wait' : 'drop', t * 1.2);
    } },
};

/* ---------- the stage (metres): glass card with a title and caption, a ledge, the models in front ---------- */
const STW = .27, STH = .21;
function stage() {
  const g = new T.Group(), back = canvasTex(1080, 840);
  const card = new T.Mesh(new T.PlaneGeometry(STW, STH), new T.MeshBasicMaterial({ map: back.t, transparent: true, depthWrite: false })); card.renderOrder = -2; g.add(card);
  const root = new T.Group(); root.scale.setScalar(.01 * .78); root.position.set(0, -.006, .045); g.add(root);
  const hemi = new T.HemisphereLight(0xffffff, 0x50606a, .95); g.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, .85); sun.position.set(.25, .35, .5); g.add(sun); g.add(sun.target);
  const P = { root, meter: meter(), strip: strip(), bottle: bottle(), beam: beam(), arrow: arrowSprite(0x3ddc84), arrow2: arrowSprite(0x3ddc84), drop: new T.Mesh(new T.SphereGeometry(.34, 24, 18), dropMat()), vial: vial(), turn: null, key: null, scene: null };
  const ring = new T.Mesh(new T.RingGeometry(3.6, 3.9, 48, 1, 0, Math.PI * 1.6), new T.MeshBasicMaterial({ color: 0x7fdbe2, transparent: true, opacity: .7, side: T.DoubleSide })); ring.position.set(0, -.6, -1); P.turn = ring;
  P.meter.add(P.strip);   // the strip rides in the meter's frame (positions below are in meter units)
  P.finger = finger(); P.meter.add(P.finger); P.badge = badge();
  P.ring = new T.Mesh(new T.RingGeometry(.9, 1.08, 40), new T.MeshBasicMaterial({ color: 0x9ff3f7, transparent: true, opacity: .8, depthTest: false, blending: T.AdditiveBlending })); P.ring.renderOrder = 5;
  for (const o of [P.meter, P.bottle, P.vial, P.beam, P.arrow, P.arrow2, P.drop, P.turn, P.badge, P.ring]) root.add(o);
  const drawCard = () => {
    const x = back.x, W = 1080, H = 840, sc = P.scene; x.clearRect(0, 0, W, H);
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(24,40,47,0.92)'); gr.addColorStop(1, 'rgba(10,18,22,0.92)'); rrect(x, 4, 4, W - 8, H - 8, 56); x.fillStyle = gr; x.fill();
    x.lineWidth = 4; x.strokeStyle = 'rgba(127,219,226,0.55)'; rrect(x, 4, 4, W - 8, H - 8, 56); x.stroke();
    x.fillStyle = 'rgba(127,219,226,0.18)'; rrect(x, 44, 40, 132, 56, 28); x.fill(); x.fillStyle = '#7fdbe2'; x.font = `700 30px ${FONT}`; x.fillText('3D', 86, 79);
    x.font = `700 26px ${FONT}`; x.fillStyle = '#9fb3b9'; x.fillText(tx('看一遍再做', 'WATCH, THEN DO'), 196, 79);
    if (sc) {
      x.fillStyle = '#eef5f7'; x.font = `700 50px ${FONT}`; x.fillText(`${P.ref} · ${sc.title()}`, 44, 158, W - 88);
      if (sc.steps) {
        const ph = P.ph || { cur: 0, done: 0 }, labels = sc.steps();
        const cw = (W - 88 - 2 * 14) / 3;
        labels.forEach((l, i) => {
          const X = 44 + i * (cw + 14), Y = 188, st = i < ph.done && i !== ph.cur ? 'done' : i === ph.cur ? 'cur' : 'next';
          rrect(x, X, Y, cw, 58, 29); x.fillStyle = st === 'cur' ? '#1aa3ae' : st === 'done' ? 'rgba(54,196,129,0.22)' : 'rgba(255,255,255,0.06)'; x.fill();
          if (st === 'next') { x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.18)'; rrect(x, X + 1, Y + 1, cw - 2, 56, 28); x.stroke(); }
          x.beginPath(); x.arc(X + 30, Y + 29, 17, 0, 7); x.fillStyle = st === 'cur' ? '#ffffff' : st === 'done' ? '#36c481' : 'rgba(255,255,255,0.16)'; x.fill();
          x.fillStyle = st === 'cur' ? '#0d6d76' : '#ffffff'; x.font = `800 21px ${FONT}`; x.textAlign = 'center'; x.fillText(st === 'done' ? '✓' : String(i + 1), X + 30, Y + 37); x.textAlign = 'left';
          x.font = `700 26px ${FONT}`; x.fillStyle = st === 'next' ? '#8ea2a8' : '#ffffff'; x.fillText(l, X + 58, Y + 38, cw - 70);
        });
      }
      x.font = `500 37px ${FONT}`; x.fillStyle = '#d5e3e7'; wrap(x, sc.cap(), W - 96).slice(0, 2).forEach((l, i) => x.fillText(l, 48, H - 104 + i * 48, W - 96));
    }
    back.t.needsUpdate = true;
  };
  g.userData = {
    P, width: STW, height: STH,
    has: (course, no, micro) => { const sc = SCENES[course + ':' + no]; return !!sc && (!sc.micro || !micro || micro === sc.micro); },
    setStep(course, no, ref) { const k = course + ':' + no + ':' + lang(); if (k === P.key) return; P.key = k; P.scene = SCENES[course + ':' + no] || null; P.ref = ref || `QC ${String(no).padStart(2, '0')}`; for (const o of [P.meter, P.bottle, P.vial, P.beam, P.arrow, P.arrow2, P.drop, P.turn, P.strip, P.finger, P.badge, P.ring]) o.visible = false; P.phKey = null; P.ph = null; P.meter.userData.setScanner(0); P.strip.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.opacity = 1; }); P.strip.userData.setFill(0); if (P.scene) P.scene.build(P); drawCard(); },
    update(time) { const sc = P.scene; if (!sc) return; const t = (time % (sc.period * 1000)) / 1000; if (sc.phase) { const ph = sc.phase(t), k = ph.cur + ':' + ph.done; if (k !== P.phKey) { P.phKey = k; P.ph = ph; drawCard(); } } sc.update(P, t); },
  };
  return g;
}

/* ---------- scan guide (2D canvas, 960 × 560): shown when a step moves from a tap to its first scan ---------- */
const GW = 960, GH = 560, GUIDE_MS = 3600, MORPH_MS = 600;
function drawGuide(cv, ms) {
  const x = cv.getContext('2d'), t = ms / 1000; x.clearRect(0, 0, GW, GH);
  const gr = x.createLinearGradient(0, 0, 0, GH); gr.addColorStop(0, 'rgba(16,40,46,0.95)'); gr.addColorStop(1, 'rgba(8,20,24,0.95)'); rrect(x, 6, 6, GW - 12, GH - 12, 54); x.fillStyle = gr; x.fill();
  x.lineWidth = 4; x.strokeStyle = 'rgba(60,177,187,0.85)'; rrect(x, 6, 6, GW - 12, GH - 12, 54); x.stroke();
  // illustration: a meter, the viewfinder closing in on its screen, a sweep, then a tick
  const mx = 250, my = 300, mw = 220, mh = 400;
  x.save(); x.translate(mx, my);
  rrect(x, -mw / 2, -mh / 2, mw, mh, 70); x.fillStyle = '#f0eef4'; x.fill(); rrect(x, -mw / 2 + 14, -mh / 2 + 18, mw - 28, mh - 36, 58); x.fillStyle = '#7656b5'; x.fill();
  const sw = 150, sh = 128, sy = -70; rrect(x, -sw / 2 - 8, sy - sh / 2 - 8, sw + 16, sh + 16, 12); x.fillStyle = '#fafafa'; x.fill();
  x.fillStyle = '#f6f8ff'; x.fillRect(-sw / 2, sy - sh / 2, sw, sh); x.fillStyle = '#2c4fae'; x.fillRect(-sw / 2, sy - sh / 2, sw, 18);
  x.fillStyle = '#c4cde4'; for (let i = 0; i < 3; i++) x.fillRect(-sw / 2 + 14, sy - sh / 2 + 32 + i * 26, sw - 28, 14);
  const close = seg(t, .25, 1.25), sweepOn = t > 1.25 && t < 2.35, done = t >= 2.35;
  const fw = lerp(sw + 260, sw + 30, close), fh = lerp(sh + 260, sh + 30, close), L = 34;
  x.strokeStyle = done ? '#36c481' : '#3cb1bb'; x.lineWidth = 9; x.lineCap = 'round';
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cx = a * fw / 2, cy = sy + b * fh / 2; x.beginPath(); x.moveTo(cx, cy - b * L); x.lineTo(cx, cy); x.lineTo(cx - a * L, cy); x.stroke(); }
  if (sweepOn) { const k = ((t - 1.25) / 1.1), ly = sy - sh / 2 + (k < .5 ? k * 2 : 2 - k * 2) * sh; x.globalAlpha = .9; x.strokeStyle = '#7fdbe2'; x.lineWidth = 5; x.beginPath(); x.moveTo(-sw / 2 - 6, ly); x.lineTo(sw / 2 + 6, ly); x.stroke(); x.globalAlpha = 1; }
  if (done) { const k = io((t - 2.35) / .35); x.globalAlpha = k; x.fillStyle = 'rgba(54,196,129,0.25)'; x.fillRect(-sw / 2, sy - sh / 2, sw, sh); x.beginPath(); x.arc(0, sy, 34 * (.6 + .4 * k), 0, 7); x.fillStyle = '#36c481'; x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 8; x.beginPath(); x.moveTo(-14, sy); x.lineTo(-4, sy + 11); x.lineTo(16, sy - 12); x.stroke(); x.globalAlpha = 1; }
  x.lineCap = 'butt'; x.restore();
  // text
  const tx0 = 450, tw = GW - tx0 - 56;
  x.fillStyle = 'rgba(60,177,187,0.2)'; rrect(x, tx0, 70, 262, 50, 25); x.fill(); x.fillStyle = '#7fdbe2'; x.font = `700 25px ${FONT}`; if ('letterSpacing' in x) x.letterSpacing = '2px'; x.fillText(tx('下一步 · 扫描屏幕', 'NEXT · SCAN'), tx0 + 22, 104); if ('letterSpacing' in x) x.letterSpacing = '0px';
  x.fillStyle = '#eef5f7'; x.font = `700 44px ${FONT}`; wrap(x, tx('看向血糖仪屏幕', 'Look at the meter screen'), tw).forEach((l, i) => x.fillText(l, tx0, 186 + i * 54, tw));
  const items = [tx('把血糖仪拿到面前，屏幕朝向自己', 'Hold the meter in front of you, screen towards you'), tx('不用点面板：头显看到屏幕就开始识别', 'No need to tap: the headset starts once it sees the screen'), tx('保持不动，等提示卡走满', 'Hold still until the card fills up')];
  let y = 272; x.font = `500 27px ${FONT}`;
  items.forEach((it, i) => { const on = t > .35 + i * .45, a = clamp01((t - .35 - i * .45) / .3); x.globalAlpha = on ? a : 0; x.fillStyle = '#3cb1bb'; x.beginPath(); x.arc(tx0 + 12, y - 9, 7, 0, 7); x.fill(); x.fillStyle = '#dfecef'; const ls = wrap(x, it, tw - 34); ls.forEach((l, j) => x.fillText(l, tx0 + 34, y + j * 36, tw - 34)); y += ls.length * 36 + 20; x.globalAlpha = 1; });
  // a thin timer along the bottom: the guide moves on by itself
  x.fillStyle = 'rgba(255,255,255,0.12)'; rrect(x, 56, GH - 46, GW - 112, 8, 4); x.fill(); x.fillStyle = '#3cb1bb'; rrect(x, 56, GH - 46, Math.max(8, (GW - 112) * clamp01(ms / GUIDE_MS)), 8, 4); x.fill();
}

window.FX3D = { stage, drawGuide, SCENES, GW, GH, GUIDE_MS, MORPH_MS, io, seg, lerp };
})();
