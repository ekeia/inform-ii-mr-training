/* 网页 MR（Meta Quest 浏览器 WebXR）：开始页 → 每段示范视频 → 小步骤 → 一轮结束自动回到开始页。
 * 3D 面板 + 手柄射线 / 手势捏合；视野里的扫描提示卡显示识别进度，识别通过后点卡片确认进入下一步。
 */
(() => {
'use strict';
const Q = window.QC; if (!Q) return;
const { S, V, CFG, CLASSES, t, L, pad } = Q;
const AR = { on: false, session: null };
const HM = { stream: null, video: null, res: null, camState: 'idle', screenPx: 0 };
const MR = { dirty: true, panel: null };
window.QC_XR = { dirty() { MR.dirty = true; if (!AR.on) renderLauncher(); }, AR, HM, MR };
const zh = () => S.lang === 'zh';
const inStep = () => !!Q.R && S.view === 'step';
const curStep = () => inStep() ? Q.BY[Q.R.i] : null;
const curTargets = () => inStep() ? Q.targetsOf(Q.R.i) : [];

/* ---------- shared: one result → evaluate + remember for drawing ---------- */
let lastRes = null;
function handle(r, src) {
  if (!r) return null;
  r.src = src; lastRes = r; lastRes.t = performance.now();
  Q.evaluate(r); MR.dirty = true;
  return r;
}

/* ---------- leave MR (back to the launcher page; the run is kept) ---------- */
function stopAR() {
  AR.on = false; window.QC_AR_ON = false;
  if (VID.el) VID.el.pause(); if (MR.panel) MR.panel.vidOpen = false;
  if (AR.session) { try { AR.session.end(); } catch (e) {} }
  document.body.classList.remove('in-mr'); Q.render(); renderLauncher();
}

/* ---------- panel actions ---------- */
/* buttons for the current small step: {label, act, kind: 'tap' | 'pri' | 'on' | 'pend' | ''}; the button a tap step waits for is white ('tap'), never the teal of the scan steps */
function microActs(no, m) {
  const R = Q.R, r = Q.rec(no), Lm = L(m), st = Q.microState(no, m), A = [];
  if (m.done === 'tap' || m.done === 'see') A.push({ label: Lm.btn || t(m.done === 'see' ? 'seeBtn' : 'doneBtn'), act: 'mtap:' + m.id, kind: 'tap' });
  else if (m.done === 'check') { const v = r.checks[m.ck] || ''; A.push({ label: t('ckOk'), act: `ck:${m.ck}:ok`, kind: v === 'ok' ? 'on' : 'tap' }, { label: t('ckPend'), act: `ck:${m.ck}:pending`, kind: v === 'pending' ? 'pend' : '' }); }
  else if (m.done === 'vision') { if (!Q.visionDone(no)) A.push({ label: t('override'), act: 'ovr', kind: 'warn' }, { label: t('rescanShort'), act: 'rescan', kind: '' }); }
  else if (m.done === 'decision') Q.C.cats.forEach(c => A.push({ label: L(c).t, act: 'cat:' + c.id, kind: R.cat === c.id ? (R.catTruth && c.id !== R.catTruth ? 'bad' : 'on') : '' }));   // patient result category
  if (st === 'wrong') A.forEach(a => { if (a.kind === 'pri' || a.kind === 'tap') a.kind = ''; });
  return A;
}
function visibleBranches(no) {
  const R = Q.R;
  return (Q.BY[no].branches || []).filter(b => !b.hidden && !['refail', 'more'].includes(b.id) && !b.onlyFail && !(b.id === 'fail' && R.rec[no] && R.rec[no].hits.fail));   // QC 11: FAIL is recorded by the trainee
}
function blockActs() {
  const R = Q.R, b = Q.branch(R.block.no, R.block.id), A = [];
  if (b.course) A.push({ label: t('goCourse', L(Q.COURSES[b.course]).title), act: 'res:course', kind: 'pri' });
  A.push({ label: b.go != null ? t('resolveGo', Q.ref(b.go)) : t('resolveContinue'), act: 'res:go', kind: b.course ? '' : 'pri' });
  A.push({ label: b.support ? t('support') : t('escalateEnd'), act: 'res:end', kind: 'bad' });
  return A;
}
function doAct(act) {
  const [a, n, m] = act.split(':'), R = Q.R;
  switch (a) {
    case 'mtap': return Q.microTap(n);
    case 'ck': return Q.setCheck(n, m);
    case 'cat': return Q.setCat(n);
    case 'br': return Q.triggerBranch(n);
    case 'res': return Q.resolveBlock(n);
    case 'ovr': return Q.override();
    case 'rescan': return Q.resetVision();
    case 'prev': return R && Q.go(R.i - 1, { noIntro: true });
    case 'next': return Q.next();
    case 'nurse': return Q.nurseConfirmLast(n + ':' + m);
    case 'start': return Q.switchCourse(n);   // new round (or continue an unfinished one)
    case 'reset': return armReset(n);
    case 'startmod': return Q.startModule();
    case 'home': return Q.goHome();
  }
}
/* "Start over" drops an unfinished round; the first tap arms the button ("tap again to confirm") for 3 s, the second resets — no dialogs in MR */
const RESET_MS = 3000;
function armReset(c) {
  const P = MR.panel, now = performance.now();
  if (P && P.resetArm && P.resetArm.c === c && now - P.resetArm.at < RESET_MS) { P.resetArm = null; Q.resetCourse(c); Q.toast(tx('已重新开始：下一轮从第 1 步开始', 'Started over: the next round begins at step 1')); return; }
  if (P) P.resetArm = { c, at: now };
  MR.dirty = true;
}
/* unfinished rounds, most recently started first */
const unfinished = () => ['qc', 'patient'].map(c => Q.RUNS[c]).filter(r => r && !r.finishedAt).sort((a, b) => b.startedAt - a.startedAt);
function visText(no) {
  const v = Q.rec(no).vision; if (!v) return '';
  return v.how === 'override' ? t('visOvr') : v.how === 'shared' ? t('visShared', Q.ref(v.from)) : v.how === 'known' ? t('visKnown')
    : v.how === 'jump' ? tx('设备已经在后面的步骤，这一步随之完成', 'The meter was already past this step') : t('visDone', Math.round((v.p || 0) * 100));
}
function nextLabel() {
  return Q.R.i === Q.STEPS.length ? (zh() ? '完成本轮' : 'Finish round') : t('next');
}

/* ---------- scan prompt in the view: "scan the screen" + progress, no frame on the meter ----------
 * shown while the current small step is a screen check; progress = screen found → this step's screen → consecutive frames until it counts.
 */
const SCAN = { key: null, prog: 0, flashUntil: 0, watch: null };
const tx = (a, b) => zh() ? a : b;
function scanState() {
  const now = performance.now();
  // recognised and the step is complete: wait for the trainee to confirm (tap this card, or Next on the panel)
  if (inStep() && Q.R.awaitConfirm === Q.R.i && Q.complete() && !Q.R.block) {
    SCAN.watch = null; SCAN.flashUntil = 0;
    const v = Q.rec(Q.R.i).vision, seen = v && v.cls ? Q.scrName(v.cls) : '';
    const au = Q.autoInfo(), left = au ? Math.max(0, au.at + au.ms - now) : null, secs = left != null ? Math.ceil(left / 1000) : 0;   // 7 s countdown, then it confirms by itself
    return { state: 'confirm', prog: 1, cd: left != null ? left / au.ms : null, title: seen ? tx(`已识别「${seen}」`, `“${seen}” recognised`) : tx('识别完成', 'Recognised'),
      text: left != null ? tx(`${secs} 秒后自动进入下一步 · 点卡片马上进入`, `Next step in ${secs} s · tap the card to go now`) : tx('确认无误就点这张卡片，进入下一步 →', 'Looks right? Tap this card for the next step →') };
  }
  // the check that was on screen just passed (e.g. with confirmation off): show "done" briefly, even if the step moves on
  const w = SCAN.watch;
  if (w && Q.R === w.run && Q.C.id === w.course) { const v = Q.rec(w.no).vision; if (v && v.done) { SCAN.watch = null; if (v.how !== 'override') { SCAN.flashUntil = now + 1400; setTimeout(() => { MR.dirty = true; }, 1450); } } }
  if (now < SCAN.flashUntil) return { state: 'done', prog: 1, title: tx('识别完成', 'Recognised'), text: tx('进入下一步…', 'Moving on…') };
  if (!inStep() || Q.R.block) return null;
  const R = Q.R, no = R.i, s = Q.BY[no]; if (!s.vision || Q.visionDone(no)) return null;
  const m = Q.curMicro(no); if (!m || m.done !== 'vision') return null;
  SCAN.watch = { run: R, course: Q.C.id, no };
  const key = Q.C.id + ':' + no + ':' + R.iter + ':' + Q.rec(no).visits + ':' + Q.rec(no).seq;
  if (key !== SCAN.key) { SCAN.key = key; SCAN.prog = 0; }
  const out = (state, prog, text) => { if (prog != null) SCAN.prog = prog; return { state, prog: SCAN.prog, title: tx('扫描血糖仪屏幕', 'Scan the meter screen'), text }; };
  if (Q.INF.err) return out('err', 0, tx('识别不可用，请用「讲师放行」', 'Recognition unavailable — use “Instructor pass”'));
  if (!HM.stream) return out('err', 0, tx('没有摄像头画面，请用「讲师放行」', 'No camera — use “Instructor pass”'));
  if (!Q.INF.det) return out('search', 0, tx('识别模型加载中…', 'Loading recognition model…'));
  const RR = lastRes && now - lastRes.t < 1500 ? lastRes : null;
  if (!RR || !RR.box) return out('search', 0, tx('看向血糖仪屏幕，放在视野正前方', 'Look at the meter screen, straight ahead'));
  if (RR.read < Q.READ_MIN) return out('blur', null, tx('反光或模糊，稍微换个角度', 'Glare or blur — change the angle a little'));
  const c = RR.probs ? CLASSES[Q.argmax(RR.probs)] : null, p = RR.probs ? Math.max(...RR.probs) : 0;
  if (c && curTargets().includes(c) && p >= Q.thAt(no, c)) return out('lock', .3 + .7 * Math.min(V.cls === c ? V.streak : 0, CFG.hold) / CFG.hold, tx('识别中，保持不动', 'Recognising — hold still'));
  // say what the camera sees and what this step waits for; after a while, point to the way out
  if (SCAN.otherKey !== key) { SCAN.otherKey = key; SCAN.otherAt = now; }
  const want = curTargets().map(Q.scrName).join(zh() ? '」或「' : '” or “'), seen = c ? Q.scrName(c) : '';
  if (c && p >= CFG.th && (s.vision.via || []).includes(c)) return out('search', .3, tx(`已到「${seen}」，继续到「${want}」`, `Reached “${seen}” — carry on to “${want}”`));   // a page on the way (QC 04: Use Strip Lot)
  const stuck = now - SCAN.otherAt > 10000 ? tx(' · 等不到就在面板点「讲师放行」', ' · if it never comes, use “Instructor pass” on the panel') : '';
  return out('other', .12, (seen ? tx(`看到「${seen}」，这一步要「${want}」`, `Seeing “${seen}”; this step needs “${want}”`) : tx(`这一步要「${want}」`, `This step needs “${want}”`)) + stuck);
}
const SCAN_COL = { search: '#3cb1bb', other: '#e9a84c', lock: '#3cb1bb', blur: '#e9a84c', err: '#e6674f', done: '#36c481', confirm: '#36c481' };

/* ---------- segment videos: at the start of each segment (plays by itself) and "▶ 视频" to re-watch during a step ----------
 * one hidden <video> drawn as a VideoTexture plane over the panel's left column.
 */
const VID = { el: null, name: null, err: false, idx: 0, mod: null, auto: null };
function vidEl() {
  if (VID.el) return VID.el;
  const v = document.createElement('video'); v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
  v.addEventListener('error', () => { VID.err = true; MR.dirty = true; });
  v.addEventListener('loadeddata', () => { VID.err = false; MR.dirty = true; });
  v.addEventListener('ended', () => { VID.endAt = performance.now(); VID.endName = VID.name; MR.dirty = true; });   // starts the 7 s countdown on the button
  v.addEventListener('play', () => { VID.endAt = 0; });
  ['play', 'pause', 'ended', 'seeked', 'volumechange'].forEach(ev => v.addEventListener(ev, () => { MR.dirty = true; if (ev === 'play') Q.markWatched(VID.name); }));
  VID.el = v; return v;
}
function introModule() { const R = Q.R; return R ? (Q.C.modules.find(m => m.id === R.mod) || Q.moduleOf(R.i)) : null; }
/* the segment whose video the headset panel shows now (null = no video view) */
function vidModule() { if (!Q.R) return null; if (S.view === 'intro') return introModule(); return inStep() && MR.panel && MR.panel.vidOpen ? Q.moduleOf(Q.R.i) : null; }
/* play with sound if the browser allows it, otherwise muted (tap the picture for sound) */
function vidPlay(v) { const p = v.play(); if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}); MR.dirty = true; }); }
function vidSync(mod) {
  if (!mod) { if (VID.el && !VID.el.paused) VID.el.pause(); return null; }
  if (VID.mod !== mod.id) { VID.mod = mod.id; VID.idx = 0; }
  const name = mod.videos[Math.min(VID.idx, mod.videos.length - 1)], v = vidEl();
  if (VID.name !== name) { VID.name = name; VID.err = false; v.muted = false; v.src = Q.videoURL(name); const po = Q.posterURL(name); if (po) v.poster = po; v.load(); }
  const key = S.view === 'intro' ? Q.C.id + ':' + mod.id : null;   // a segment's video starts by itself when its intro opens
  if (key && VID.auto !== key) { VID.auto = key; vidPlay(v); }
  return name;
}
function vidToggle() {
  const v = vidEl();
  if (v.muted && !v.paused) v.muted = false;
  else if (v.paused || v.ended) vidPlay(v);
  else v.pause();
  MR.dirty = true;
}
function vidRestart() { const v = vidEl(); try { v.currentTime = 0; } catch (e) {} if (v.paused) vidPlay(v); }
function vidNext() { const mod = vidModule(); if (!mod) return; VID.idx = (VID.idx + 1) % mod.videos.length; vidSync(mod); vidPlay(vidEl()); MR.dirty = true; }
const fmtT = s0 => { if (!isFinite(s0)) return '--:--'; const s1 = Math.floor(s0); return `${Math.floor(s1 / 60)}:${String(s1 % 60).padStart(2, '0')}`; };
/* ---------- launcher page: camera first (Quest grants it only outside the immersive session), then enter MR ---------- */
const LN = { xr: null };
function renderLauncher() {
  const st = HM.camState, el = id => document.getElementById(id);
  if (el('camState')) { el('camState').textContent = t('camState_' + st) + (st === 'on' && Q.camInfoText(HM.video) ? ' · ' + Q.camInfoText(HM.video) : ''); el('camState').className = 'st ' + (st === 'on' ? 'ok' : st === 'denied' || st === 'error' ? 'bad' : ''); }
  if (el('prepCam')) el('prepCam').disabled = st === 'on' || st === 'asking';
  if (el('xrState')) { el('xrState').textContent = LN.xr === null ? '…' : LN.xr ? (zh() ? '支持' : 'supported') : (zh() ? '不支持（请用 Meta Quest 浏览器打开）' : 'not supported (open in the Meta Quest browser)'); el('xrState').className = 'st ' + (LN.xr ? 'ok' : LN.xr === false ? 'bad' : ''); }
  if (el('prepEnter')) el('prepEnter').disabled = !LN.xr || AR.on;
  const rs = el('resume');
  if (rs) {
    const un = AR.on ? [] : unfinished(), armed = LN.arm && performance.now() - LN.arm.at < RESET_MS ? LN.arm.c : null;
    rs.hidden = !un.length;
    const sig = JSON.stringify([S.lang, armed, un.map(r => [r.course, r.i])]);   // rebuild only on change, so a status refresh never swallows a tap
    if (rs.dataset.sig !== sig) { rs.dataset.sig = sig; rs.replaceChildren(...un.map(r => {
      const row = document.createElement('div'), sp = document.createElement('span'), b = document.createElement('button'), title = L(Q.COURSES[r.course]).title;
      row.className = 'row'; sp.textContent = tx(`上次没做完：${title} · 第 ${pad(r.i)} 步。进入 MR 后可以继续。`, `Not finished: ${title} · step ${pad(r.i)}. You can continue it in MR.`);
      b.className = 'btn' + (armed === r.course ? ' danger' : ''); b.dataset.reset = r.course; b.textContent = armed === r.course ? tx('再点一次确认重置', 'Tap again to reset') : tx('重新开始', 'Start over');
      row.append(sp, b); return row;
    })); }
  }
}
function launcherReset(c) {
  const now = performance.now();
  if (LN.arm && LN.arm.c === c && now - LN.arm.at < RESET_MS) { LN.arm = null; Q.resetCourse(c); Q.toast(tx('进度已重置，下一轮从第 1 步开始', 'Progress reset: the next round begins at step 1')); }
  else { LN.arm = { c, at: now }; setTimeout(renderLauncher, RESET_MS + 50); }
  renderLauncher();
}
async function prepCamera() {
  try {
    HM.camState = 'asking'; renderLauncher();
    HM.stream = await Q.getCamera();
    const v = document.getElementById('camPreview'); v.srcObject = HM.stream; v.hidden = false; await v.play(); HM.video = v; HM.camState = 'on'; v.addEventListener('resize', renderLauncher);
  } catch (e) { HM.camState = (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) ? 'denied' : 'error'; }
  renderLauncher();
}
async function prepEnter() {
  AR.on = true; window.QC_AR_ON = true; renderLauncher();
  try { await startWebXR(); document.body.classList.add('in-mr'); }
  catch (e) { AR.on = false; window.QC_AR_ON = false; Q.toast('WebXR: ' + (e.message || e)); renderLauncher(); }
}
(async () => { try { LN.xr = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')); } catch (e) { LN.xr = false; } renderLauncher(); })();

/* ---------- headset frames → worker (whole frame; in every step — the screen checks, and hidden: following the meter, see app.js followMeter) ----------
 * Nothing is drawn on the meter itself: the passthrough camera is not at the eye, so a frame drawn from camera
 * coordinates never lines up with what the wearer sees. Progress is shown in the scan prompt in the view instead.
 */
function sendHeadsetFrame(now) {
  const v = HM.video;
  if (!v || !v.videoWidth || Q.INF.busy || !inStep()) return;
  if (now - (HM.lastSend || 0) < (curStep().vision ? 150 : 300)) return;   // steps without a screen check: slower, nothing shown
  HM.lastSend = now;
  const p = Q.infer(v, 'full', 1280); if (!p) return;
  p.then(r => {
    if (!r) return;
    const res = { w: r.fw, h: r.fh, rect: r.box ? { x: r.box.x * r.fw, y: r.box.y * r.fh, w: r.box.w * r.fw, h: r.box.h * r.fh } : null, r };
    if (res.rect) HM.screenPx = Math.round(res.rect.w);
    HM.res = res;
    handle(r, 'hm');
  });
}

/* ---------- WebXR session → 3D panel ---------- */
async function startWebXR() {
  const session = await navigator.xr.requestSession('immersive-ar', { optionalFeatures: ['local-floor', 'hand-tracking'] });
  AR.session = session;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio); renderer.setSize(innerWidth, innerHeight); renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local'); renderer.domElement.id = 'xrCanvas'; renderer.domElement.style.display = 'none'; document.body.appendChild(renderer.domElement);
  await renderer.xr.setSession(session);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .01, 20);
  Q.goHome();   // MR opens on the start page; a round left midway shows "Continue · step n" and "Start over" there
  const P = buildPanel(scene, renderer);
  Q.render();
  session.addEventListener('end', () => { renderer.setAnimationLoop(null); renderer.domElement.remove(); AR.session = null; MR.panel = null; if (AR.on) stopAR(); });
  renderer.setAnimationLoop((time, frame) => {
    if (!frame) return;
    if (HM.stream) sendHeadsetFrame(time);   // passthrough camera through getUserMedia
    P.update(time, frame);
    renderer.render(scene, camera);
  });
  AR.renderer = renderer; AR.camera = camera;
}

/* ---------- 3D panel ---------- */
const PW = 1280, PH = 800, PANEL_W = .64, PANEL_H = PANEL_W * PH / PW;
const BW = 1280, BH = 104, BAR_W = PANEL_W, BAR_H = BAR_W * BH / BW;   // window bar under the panel: grab + window tools (like Quest system windows)
/* scan prompt: 20 cm card, 55 cm ahead, 9° above the line of sight (hospital feedback: 16.5° was too high), moved 8 cm away from the panel's side.
 * At 9° the card (±3.3° tall) is level with the panel's upper part, so it has to clear the panel sideways: the default panel's inner edge is at about 3.8° from
 * the centre of view, the card's inner edge at 0.08 − 0.10 = −0.02 m → about 2.1°, leaving a gap of about 1.7°. */
const SCAN_W = .2, SCAN_D = .55, SCAN_UP = Math.tan(9 * Math.PI / 180), SCAN_SIDE = .08;
const COL = { ink: '#eef5f7', ink2: '#b3c5cb', ink3: '#7e949b', surf: 'rgba(255,255,255,0.05)', line: 'rgba(255,255,255,0.09)',
  accent: '#3cb1bb', accentHi: '#7fdbe2', pass: '#36c481', warn: '#e9a84c', crit: '#e6674f', pend: '#a38df0' };
const FONT = '"Noto Sans SC","IBM Plex Sans","PingFang SC","Microsoft YaHei",sans-serif', MONO = '"IBM Plex Mono",ui-monospace,monospace';
const LX = 36, LW = 800, RX = 872, RW = PW - 36 - RX, BY0 = PH - 36 - 72;   // left column, right column, footer row
/* motion: cubic ease-out for entrances, a slight overshoot for confirmations */
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const eOut = k => 1 - Math.pow(1 - clamp01(k), 3);
const eBack = k => { k = clamp01(k); const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
function roundRect(x, X, Y, W, H, R0) { R0 = Math.max(0, Math.min(R0, W / 2, H / 2)); x.beginPath(); x.moveTo(X + R0, Y); x.arcTo(X + W, Y, X + W, Y + H, R0); x.arcTo(X + W, Y + H, X, Y + H, R0); x.arcTo(X, Y + H, X, Y, R0); x.arcTo(X, Y, X + W, Y, R0); x.closePath(); }
function rr(x, X, Y, W, H, R0, fill) { roundRect(x, X, Y, W, H, R0); x.fillStyle = fill; x.fill(); }
function rrs(x, X, Y, W, H, R0, stroke, lw) { roundRect(x, X + lw / 2, Y + lw / 2, W - lw, H - lw, R0 - lw / 2); x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); }
function font(x, size, weight, mono) { x.font = `${weight || 400} ${size}px ${mono ? MONO : FONT}`; }
function spacing(x, px) { if ('letterSpacing' in x) x.letterSpacing = px + 'px'; }
function label(x, s, X, Y, col, maxW) { font(x, 18, 600); spacing(x, 1.4); x.fillStyle = col || COL.ink3; x.fillText(s, X, Y, maxW || 760); spacing(x, 0); }
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function wrapText(x, text, maxW, maxLines) {
  const toks = String(text).match(/[⺀-鿿豈-﫿＀-￯　-〿]|[^\s⺀-鿿豈-﫿＀-￯　-〿]+|\s+/g) || [];
  const lines = []; let cur = '';
  for (const tk of toks) { const test = cur + tk; if (x.measureText(test).width > maxW && cur.trim() && !/^[，。、；：！？」』）》】,.;:!?…]$/.test(tk)) { lines.push(cur.trimEnd()); cur = /^\s+$/.test(tk) ? '' : tk; } else cur = test; }
  if (cur.trim()) lines.push(cur.trimEnd());
  if (lines.length > maxLines) { lines.length = maxLines; let l = lines[maxLines - 1]; while (l && x.measureText(l + '…').width > maxW) l = l.slice(0, -1); lines[maxLines - 1] = l + '…'; }
  return lines;
}
/* line icons on a 24-unit grid, centred on (cx, cy) — drawn, so they never depend on the headset's fonts */
function icon(x, name, cx, cy, s, col, lw) {
  x.save(); x.translate(cx, cy); x.scale(s / 24, s / 24);
  x.strokeStyle = col; x.fillStyle = col; x.lineWidth = lw || 2.4; x.lineCap = 'round'; x.lineJoin = 'round';
  const head = (px, py, a, l) => { x.beginPath(); x.moveTo(px + Math.cos(a + 2.5) * l, py + Math.sin(a + 2.5) * l); x.lineTo(px, py); x.lineTo(px + Math.cos(a - 2.5) * l, py + Math.sin(a - 2.5) * l); x.stroke(); };
  x.beginPath();
  switch (name) {
    case 'home': x.moveTo(-9.5, -.5); x.lineTo(0, -9); x.lineTo(9.5, -.5); x.moveTo(-6.5, -3); x.lineTo(-6.5, 8.5); x.lineTo(6.5, 8.5); x.lineTo(6.5, -3); x.stroke(); break;
    case 'play': x.moveTo(-5.5, -8.5); x.lineTo(8.5, 0); x.lineTo(-5.5, 8.5); x.closePath(); x.fill(); break;
    case 'pause': x.rect(-7.5, -8.5, 5, 17); x.rect(2.5, -8.5, 5, 17); x.fill(); break;
    case 'restart': x.rect(-9.5, -8.5, 3.2, 17); x.fill(); x.beginPath(); x.moveTo(8.5, -8.5); x.lineTo(-4, 0); x.lineTo(8.5, 8.5); x.closePath(); x.fill(); break;
    case 'skip': x.moveTo(-8.5, -8.5); x.lineTo(4, 0); x.lineTo(-8.5, 8.5); x.closePath(); x.fill(); x.beginPath(); x.rect(6.3, -8.5, 3.2, 17); x.fill(); break;
    case 'video': roundRect(x, -10, -7.5, 20, 15, 3.5); x.stroke(); x.beginPath(); x.moveTo(-2.5, -3.6); x.lineTo(4, 0); x.lineTo(-2.5, 3.6); x.closePath(); x.fill(); break;
    case 'close': x.moveTo(-7, -7); x.lineTo(7, 7); x.moveTo(7, -7); x.lineTo(-7, 7); x.stroke(); break;
    case 'reset': x.arc(0, 0, 8, -1.1, 4.4); x.stroke(); head(8 * Math.cos(4.4), 8 * Math.sin(4.4), 4.4 + Math.PI / 2, 4.5); break;
    case 'swap': x.moveTo(-8.5, -4); x.lineTo(8.5, -4); x.moveTo(8.5, 4); x.lineTo(-8.5, 4); x.stroke(); head(8.5, -4, 0, 4.2); head(-8.5, 4, Math.PI, 4.2); break;
    case 'follow': x.arc(0, 0, 8.5, 0, 7); x.stroke(); x.beginPath(); x.arc(0, 0, 3, 0, 7); x.fill(); break;
    case 'pin': x.arc(0, -4, 5.5, 0, 7); x.fill(); x.beginPath(); x.moveTo(0, 1); x.lineTo(0, 10); x.stroke(); break;
    case 'check': x.moveTo(-8.5, .5); x.lineTo(-2.8, 6.2); x.lineTo(8.8, -6.5); x.stroke(); break;
    case 'flag': x.moveTo(-6, 10); x.lineTo(-6, -9.5); x.stroke(); x.beginPath(); x.moveTo(-6, -9.5); x.lineTo(8.5, -5.5); x.lineTo(-6, -.5); x.closePath(); x.fill(); break;
    case 'warn': x.moveTo(0, -9.5); x.lineTo(10, 8); x.lineTo(-10, 8); x.closePath(); x.stroke(); x.beginPath(); x.moveTo(0, -3); x.lineTo(0, 2); x.stroke(); x.beginPath(); x.arc(0, 5, 1.3, 0, 7); x.fill(); break;
    case 'speech': roundRect(x, -10.5, -9, 21, 14.5, 4.5); x.stroke(); x.beginPath(); x.moveTo(-4, 5.5); x.lineTo(-7, 10); x.lineTo(1.5, 5.5); x.stroke(); break;
    case 'vial': x.rotate(.5); x.moveTo(-4.5, -9.5); x.lineTo(-4.5, 5); x.arc(0, 5, 4.5, Math.PI, 0, true); x.lineTo(4.5, -9.5); x.stroke(); x.beginPath(); x.moveTo(-7, -9.5); x.lineTo(7, -9.5); x.stroke(); x.beginPath(); x.moveTo(-4.5, 0); x.lineTo(4.5, 0); x.lineTo(4.5, 5); x.arc(0, 5, 4.5, 0, Math.PI); x.closePath(); x.fill(); break;
    case 'drop': x.moveTo(0, -10.5); x.quadraticCurveTo(8.5, -1, 7.5, 3.5); x.arc(0, 3.5, 7.5, 0, Math.PI); x.quadraticCurveTo(-8.5, -1, 0, -10.5); x.fill(); break;
    case 'scan': [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { x.moveTo(a * 9.5, b * 9.5 - b * 5); x.lineTo(a * 9.5, b * 9.5); x.lineTo(a * 9.5 - a * 5, b * 9.5); }); x.stroke(); break;
    case 'list': for (const i of [-1, 0, 1]) { x.moveTo(-3, i * 6.5); x.lineTo(9.5, i * 6.5); } x.stroke(); for (const i of [-1, 0, 1]) { x.beginPath(); x.arc(-8, i * 6.5, 1.8, 0, 7); x.fill(); } break;
    case 'tap': x.arc(0, 0, 8.5, 0, 7); x.stroke(); x.beginPath(); x.arc(0, 0, 3.2, 0, 7); x.fill(); break;
    case 'eye': x.moveTo(-10.5, 0); x.quadraticCurveTo(0, -10, 10.5, 0); x.quadraticCurveTo(0, 10, -10.5, 0); x.stroke(); x.beginPath(); x.arc(0, 0, 3.2, 0, 7); x.fill(); break;
    case 'q': x.arc(0, -3.5, 5, Math.PI * 1.05, Math.PI * .45); x.quadraticCurveTo(0, 0, 0, 3); x.stroke(); x.beginPath(); x.arc(0, 8, 1.4, 0, 7); x.fill(); break;
    case 'info': x.arc(0, 0, 9.5, 0, 7); x.stroke(); x.beginPath(); x.moveTo(0, -1); x.lineTo(0, 5.5); x.stroke(); x.beginPath(); x.arc(0, -5, 1.4, 0, 7); x.fill(); break;
    case 'arrowL': x.moveTo(8.5, 0); x.lineTo(-8.5, 0); x.stroke(); head(-8.5, 0, Math.PI, 6); break;
    case 'arrowR': x.moveTo(-8.5, 0); x.lineTo(8.5, 0); x.stroke(); head(8.5, 0, 0, 6); break;
    case 'grip': for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { x.beginPath(); x.arc(-6 + i * 6, -3 + j * 6, 1.9, 0, 7); x.fill(); } break;
  }
  x.restore();
}
const toneCol = tone => tone === 'ok' ? COL.pass : tone === 'retry' ? COL.warn : tone === 'stop' ? COL.crit : tone === 'confirm' ? COL.pend : COL.accent;
const typeCol = ty => ty === 'retry' ? COL.warn : ty === 'stop' ? COL.crit : ty === 'confirm' ? COL.pend : COL.pass;
/* button styles: f = fill, fh = fill on hover, c = text, b = border */
const KIND = {
  sec: { f: 'rgba(255,255,255,0.075)', fh: 'rgba(255,255,255,0.16)', c: COL.ink },
  pri: { f: '#0f8591', fh: '#15a2ae', c: '#ffffff' },
  tap: { f: '#dfeaec', fh: '#ffffff', c: '#0c2b31', rp: '#0c2b31', hr: 'rgba(12,43,49,0.45)' },   // the one button a tap step waits for (Done, I see it)
  ok: { f: '#1d9862', fh: '#25b676', c: '#ffffff' },
  on: { f: '#1d9862', fh: '#25b676', c: '#ffffff' },
  pend: { f: 'rgba(163,141,240,0.2)', fh: 'rgba(163,141,240,0.36)', c: '#e4dcff', b: 'rgba(163,141,240,0.55)' },
  warn: { f: 'rgba(233,168,76,0.14)', fh: 'rgba(233,168,76,0.3)', c: '#ffd9a0', b: 'rgba(233,168,76,0.5)' },
  danger: { f: '#c4533f', fh: '#d8634d', c: '#ffffff' },   // an armed destructive button ("tap again to confirm")
  bad: { f: 'rgba(230,103,79,0.18)', fh: 'rgba(230,103,79,0.34)', c: '#ffc4b7', b: 'rgba(230,103,79,0.5)' },
};
const KIND_OF = k => k === 'tap' ? 'tap' : k === 'pri' ? 'pri' : k === 'on' ? 'on' : k === 'pend' ? 'pend' : k === 'bad' ? 'bad' : k === 'warn' ? 'warn' : 'sec';
/* how a small step is completed — by the camera (SCAN, teal, viewfinder icon) or by a tap (TAP, white, the cursor's ring-and-dot icon).
 * Shown as a strip on top of the step card and as icons on the progress bar (hospital feedback: tell "tap Done" steps from scan steps at a glance). */
const isScan = m => m.done === 'vision';
const TAPCOL = '#eef5f7';
function modeText(m) {
  if (isScan(m)) return [tx('扫描屏幕', 'SCAN THE SCREEN'), CFG.confirm ? tx('看向血糖仪屏幕，识别后点视野里的绿色卡片', 'Look at the meter, then tap the green card') : tx('看向血糖仪屏幕，识别到就自动完成，不用点', 'Look at the meter; it completes by itself')];
  if (m.done === 'check') return [tx('点「已完成」', 'TAP “DONE”'), tx('不用扫描：做完后点一次「已完成」', 'Nothing to scan: do it, then tap “Done” once')];
  if (m.done === 'see') return [tx('看到后点一下', 'TAP WHEN YOU SEE IT'), tx('不用扫描：看到后点下面的按钮', 'Nothing to scan: tap the button below when you see it')];
  if (m.done === 'decision') return [tx('选一项', 'TAP TO CHOOSE'), tx('不用扫描：点对应的结果类别', 'Nothing to scan: tap the matching result category')];
  return [tx('点按', 'TAP'), tx('不用扫描：做完后点下面的按钮', 'Nothing to scan: tap the button below when done')];
}
/* the modes a step contains, in the order its small steps come, for the progress bar: ['scan'], ['tap'], ['tap', 'scan'] … */
function stepModes(no) { const out = []; for (const m of Q.microsOf(no)) { const k = isScan(m) ? 'scan' : 'tap'; if (!out.includes(k)) out.push(k); } return out; }
const SCAN_WORD = { search: ['看向屏幕', 'Look at the screen'], other: ['不是这一页', 'Not this page'], lock: ['识别中', 'Recognising'], blur: ['反光／模糊', 'Glare / blur'], err: ['识别不可用', 'Unavailable'], done: ['已识别', 'Recognised'], confirm: ['已识别', 'Recognised'] };

/* hover amount for a control (0…1, eased in ~110 ms, out ~180 ms) */
function hoverAmt(P, act) {
  const tgt = P.hover === act ? 1 : 0, cur = P.hv[act] == null ? 0 : P.hv[act];
  const v = tgt > cur ? Math.min(1, cur + P.dt / 110) : Math.max(0, cur - P.dt / 180);
  P.hv[act] = v; if (v !== tgt) P.need = true;
  return eOut(v);
}
/* a button: fill eased toward its hover colour, a light rim on hover, a ripple from the press point, optional countdown fill / breathing rim */
function drawBtn(P, x, hits, X, Y, W, H, text, act, o = {}) {
  const k = KIND[o.kind || 'sec'], dis = !!o.disabled, h = dis ? 0 : hoverAmt(P, act), r = o.r != null ? o.r : Math.min(18, H / 2), now = P.now;
  if (dis) rr(x, X, Y, W, H, r, 'rgba(255,255,255,0.04)');
  else { rr(x, X, Y, W, H, r, k.f); if (h > 0) { x.globalAlpha = h; rr(x, X, Y, W, H, r, k.fh); x.globalAlpha = 1; } }
  if (!dis && k.b) rrs(x, X, Y, W, H, r, k.b, 2);
  if (o.fillK != null) { x.save(); roundRect(x, X, Y, W, H, r); x.clip(); x.fillStyle = 'rgba(255,255,255,0.2)'; x.fillRect(X, Y, W * clamp01(o.fillK), H); x.restore(); P.need = true; }
  if (o.glow && !dis) { const ph = (Math.sin(now / 1000 * Math.PI * 1.25) + 1) / 2; x.globalAlpha = .25 + .55 * ph; rrs(x, X - 6, Y - 6, W + 12, H + 12, r + 6, '#8af0bd', 3); x.globalAlpha = 1; P.slow = true; }
  if (h > 0) { x.globalAlpha = h * .6; rrs(x, X, Y, W, H, r, k.hr || 'rgba(255,255,255,0.75)', 2); x.globalAlpha = 1; }
  const rp = P.ripple;
  if (rp && rp.act === act) { const q = (now - rp.t) / 460; if (q < 1) { x.save(); roundRect(x, X, Y, W, H, r); x.clip(); x.globalAlpha = .34 * (1 - q); x.fillStyle = k.rp || '#ffffff'; x.beginPath(); x.arc(rp.x != null ? rp.x : X + W / 2, rp.y != null ? rp.y : Y + H / 2, 12 + eOut(q) * Math.hypot(W, H), 0, 7); x.fill(); x.restore(); P.need = true; } }
  const size = o.size || 24, col = dis ? COL.ink3 : (o.color || k.c), iw = o.icon ? Math.round(size * 1.05) : 0, gap = o.icon && text ? 11 : 0;
  font(x, size, o.weight || 600); const maxT = W - 28 - iw - gap, tw = text ? Math.min(maxT, x.measureText(text).width) : 0;
  let cx0 = o.align === 'left' ? X + 22 : X + (W - tw - iw - gap) / 2;
  if (o.icon && !o.iconRight) { icon(x, o.icon, cx0 + iw / 2, Y + H / 2, size * .95, col, o.iconLw); cx0 += iw + gap; }
  if (text) { x.fillStyle = col; x.textBaseline = 'middle'; x.fillText(text, cx0, Y + H / 2 + 1, maxT); x.textBaseline = 'alphabetic'; }
  if (o.icon && o.iconRight) icon(x, o.icon, cx0 + tw + gap + iw / 2 + 3 * h, Y + H / 2, size * .95, col, o.iconLw);
  if (!dis) hits.push({ x: X, y: Y, w: W, h: H, act });
}

/* which small step the card shows: a checklist that was just ticked stays for a moment while its items tick off */
function stepShow(P, no) {
  const ms = Q.microsOf(no), m = Q.curMicro(no), key = Q.C.id + ':' + no + ':' + (m ? m.id : '-');
  if (P.mKey && P.mKey !== key && P.mPrev && P.mPrev.no === no && P.mPrev.c === Q.C.id) {
    const pm = ms.find(z => z.id === P.mPrev.id);
    if (pm && pm.done === 'check' && Q.microDone(no, pm)) P.celeb = { no, c: Q.C.id, id: pm.id, at: P.now, st: Q.microState(no, pm) };
  }
  P.mKey = key; P.mPrev = { no, c: Q.C.id, id: m ? m.id : null };
  const cb = P.celeb && P.celeb.no === no && P.celeb.c === Q.C.id && P.now - P.celeb.at < 760 ? P.celeb : null;
  if (cb) P.need = true;
  // all done: the last small step's guide stays on the card, with the result row in place of its buttons (11-09, user request)
  const done = !m && ms.length ? ms[ms.length - 1] : null;
  return { ms, m, show: cb ? ms.find(z => z.id === cb.id) : (m || done), cb, done: !!done && !cb };
}

function drawPanel(P) {
  const x = P.ctx, R = Q.R, now = P.now = performance.now(), hits = [];
  P.dt = Math.min(120, now - (P.drawAt || now)); P.drawAt = now; P.need = false; P.slow = false;
  const home = !R || S.view === 'home', step = inStep(), no = R ? R.i : 0, s = step ? Q.BY[no] : null;
  const vmod = vidModule(), vname = vidSync(vmod), intro = !home && S.view === 'intro'; P.vidRect = null;
  const btn = (X, Y, W, H, text, act, o) => drawBtn(P, x, hits, X, Y, W, H, text, act, o);
  // ---- surface ----
  x.clearRect(0, 0, PW, PH);
  const bg = x.createLinearGradient(0, 0, 0, PH); bg.addColorStop(0, 'rgba(22,37,44,0.965)'); bg.addColorStop(1, 'rgba(11,19,24,0.965)');
  roundRect(x, 0, 0, PW, PH, 40); x.fillStyle = bg; x.fill();
  x.save(); roundRect(x, 0, 0, PW, PH, 40); x.clip(); const gl = x.createLinearGradient(0, 0, 0, 140); gl.addColorStop(0, 'rgba(120,220,228,0.07)'); gl.addColorStop(1, 'rgba(120,220,228,0)'); x.fillStyle = gl; x.fillRect(0, 0, PW, 140); x.restore();
  rrs(x, 0, 0, PW, PH, 40, 'rgba(255,255,255,0.12)', 2);
  // ---- content key: a change slides the content in ----
  const sh = step && !vmod && !R.block ? stepShow(P, no) : null;
  const sig = home ? 'home' : vmod ? 'vid:' + vmod.id : intro ? 'intro' : R.block ? 'block:' + no : `step:${Q.C.id}:${no}:${sh.show ? sh.show.id : '-'}`;
  if (sig !== P.sig) { P.sig = sig; P.sigAt = now; }
  const tk = eOut((now - P.sigAt) / 340); if (tk < 1) P.need = true;
  if (!home && (P.badgeNo !== no || P.badgeC !== Q.C.id)) { P.badgeNo = no; P.badgeC = Q.C.id; P.badgeAt = now; }
  // ---- header: badge · title · subtitle · page buttons ----
  const bgB = x.createLinearGradient(0, 32, 0, 100); bgB.addColorStop(0, '#15939f'); bgB.addColorStop(1, '#0b6c76');
  roundRect(x, LX, 32, 68, 68, 20); x.fillStyle = bgB; x.fill();
  if (home) { font(x, 24, 700, true); x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText('MR', LX + 34, 75); x.textAlign = 'left'; }
  else if (intro || vmod) icon(x, 'play', LX + 36, 66, 30, '#fff');
  else { const bk = eBack((now - P.badgeAt) / 420); if (bk < 1) P.need = true; x.save(); x.translate(LX + 34, 66); x.scale(.6 + .4 * bk, .6 + .4 * bk); x.globalAlpha = clamp01(bk * 1.4); font(x, 32, 600, true); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(pad(no), 0, 2); x.restore(); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; }
  let bx = PW - 36;
  if (!home) { bx -= 172; btn(bx, 38, 172, 56, zh() ? '开始页面' : 'Start page', 'act:home', { icon: 'home', size: 21 }); }
  if (step && R.mode !== 'exam' && Q.moduleOf(no)) { bx -= 188; btn(bx, 38, 176, 56, P.vidOpen ? (zh() ? '关闭视频' : 'Close video') : (zh() ? '示范视频' : 'Demo video'), P.vidOpen ? 'vid:close' : 'vid:open', { icon: P.vidOpen ? 'close' : 'video', size: 21, kind: P.vidOpen ? 'pri' : 'sec' }); }
  const title = home ? (zh() ? '开始页面' : 'Start') : (intro || (vmod && S.view === 'intro')) ? L(introModule()).title : L(s).title;
  font(x, 36, 700); x.fillStyle = COL.ink; x.fillText(title, LX + 88, 64, bx - LX - 88 - 24);
  font(x, 21); x.fillStyle = COL.ink2;
  if (home) x.fillText(t('homeTitle'), LX + 88, 95, bx - LX - 112);
  else { const mod = Q.moduleOf(no); x.fillText(`${L(Q.C).title}${mod ? ' · ' + t('moduleN', Q.C.modules.indexOf(mod) + 1) : ''} · ${zh() ? `第 ${(Q.ROUNDS[Q.C.id] || 0) + 1} 轮` : `round ${(Q.ROUNDS[Q.C.id] || 0) + 1}`}`, LX + 88, 95, bx - LX - 112); }
  // progress: one segment per step, a wider gap between video segments; a step that completes fills from the left
  if (!home) {
    const n = Q.STEPS.length, mods = Q.C.modules, gaps = mods.length - 1, segW = (PW - 72 - gaps * 12 - (n - gaps - 1) * 4) / n, rk = Q.C.id + ':' + R.startedAt;
    if (P.segRun !== rk) { P.segRun = rk; P.segAt = {}; for (let i = 1; i <= n; i++) if (R.rec[i] && Q.complete(i)) P.segAt[i] = -1e9; }
    let sx = LX;
    for (let i = 1; i <= n; i++) {
      const done = !!(R.rec[i] && Q.complete(i)), cur = i === no;
      if (done && P.segAt[i] == null) P.segAt[i] = now; if (!done) delete P.segAt[i];
      rr(x, sx, 110, segW, 22, 11, cur ? 'rgba(60,177,187,0.35)' : 'rgba(255,255,255,0.1)');
      if (done) { const fk = eOut((now - P.segAt[i]) / 460); if (fk < 1) P.need = true; rr(x, sx, 110, Math.max(22, segW * fk), 22, 11, COL.pass); }
      else if (cur) rr(x, sx, 110, segW, 22, 11, COL.accent);
      const ks = stepModes(i), on = done || cur, ix0 = sx + segW / 2 - (ks.length - 1) * 8.5;   // what this step asks for: scan, tap or both
      ks.forEach((k, j) => icon(x, k, ix0 + j * 17, 121, 14, on ? 'rgba(6,22,26,0.75)' : 'rgba(255,255,255,0.45)', 2.8));
      sx += segW + (mods.some(m => m.steps[1] === i) && i < n ? 12 : 4);
    }
  }
  // ---- content (fades and slides in on change) ----
  x.save(); x.globalAlpha = tk; x.translate(0, (1 - tk) * 18);
  let y = 146;
  // instruction callout (what the trainer would say now)
  const un = home ? unfinished()[0] : null, unNew = un && (!Q.LAST || !Q.LAST.finishedAt || Q.LAST.finishedAt < un.startedAt);
  const mr = home && unNew ? { txt: tx(`上次的「${L(Q.COURSES[un.course]).title}」做到第 ${pad(un.i)} 步：点「继续」接着做，或点「重新开始」从第 1 步重来。`, `${L(Q.COURSES[un.course]).title} was left at step ${pad(un.i)}: Continue where you stopped, or Start over from step 1.`), tone: 'info' }
    : home ? (Q.LAST ? { txt: zh() ? '这一轮完成了，已回到开始页面。可以开始下一轮。' : 'Round finished — back on the start page. Start the next round when ready.', tone: 'ok' }
    : { txt: zh() ? '选择这一轮要做的测试。每轮结束后会自动回到这里。' : 'Choose this round’s test. You come back here after every round.', tone: 'info' })
    : intro ? { txt: zh() ? `先看本段示范视频，看完点「${t('startModule', introModule().steps[0]).replace(' →', '')}」。` : 'Watch this segment’s demonstration, then start the step.', tone: 'info' } : Q.mrNow();
  const tc = toneCol(mr.tone);
  font(x, 25, 500); const mrL = wrapText(x, mr.txt, LW - 96, 2), mrH = 24 + mrL.length * 34;
  rr(x, LX, y, LW, mrH, 20, rgba(tc, .15)); x.save(); roundRect(x, LX, y, LW, mrH, 20); x.clip(); x.fillStyle = tc; x.fillRect(LX, y, 6, mrH); x.restore();
  icon(x, home && Q.LAST ? 'check' : 'speech', LX + 46, y + mrH / 2, 26, tc, 2.6);
  x.fillStyle = COL.ink; mrL.forEach((l, i) => x.fillText(l, LX + 80, y + 38 + i * 34, LW - 100));
  y += mrH + 16;
  if (home) drawHome(P, x, hits, btn, y);
  else if (vmod) drawVideo(P, x, hits, btn, y, vmod, vname);
  else if (R.block) drawBlock(P, x, btn, y);
  else drawStep(P, x, hits, btn, y, no, s, sh);
  x.restore();
  P.hits = hits;
}

function drawHome(P, x, hits, btn, y) {
  const now = P.now;
  label(x, zh() ? '选择本轮测试' : 'CHOOSE A TEST', LX, y + 14); y += 30;
  for (const c of ['qc', 'patient']) {
    const run = Q.RUNS[c], co = Q.COURSES[c], cont = run && !run.finishedAt, h = 150, act = 'act:start:' + c, hv = hoverAmt(P, act), lift = 4 * hv;
    const Y = y - lift;
    if (hv > 0) { x.save(); x.filter = 'blur(10px)'; x.globalAlpha = .45 * hv; rr(x, LX + 8, Y + 14, LW - 16, h, 24, '#000'); x.restore(); }
    const g = x.createLinearGradient(LX, Y, LX + LW, Y + h); g.addColorStop(0, hv > 0 ? '#14919d' : '#117f8a'); g.addColorStop(1, '#0a5861');
    roundRect(x, LX, Y, LW, h, 24); x.fillStyle = g; x.fill();
    if (hv > 0) { x.globalAlpha = hv * .7; rrs(x, LX, Y, LW, h, 24, COL.accentHi, 2.5); x.globalAlpha = 1; }
    rr(x, LX + 28, Y + 33, 84, 84, 24, 'rgba(255,255,255,0.14)'); icon(x, c === 'qc' ? 'vial' : 'drop', LX + 70, Y + 75, 42, '#ffffff', 2.6);
    x.fillStyle = '#fff'; font(x, 34, 700); x.fillText(L(co).title, LX + 136, Y + 66, 420);
    x.fillStyle = 'rgba(226,246,248,0.82)'; font(x, 21); wrapText(x, L(co).sub || '', cont ? 340 : 380, 2).forEach((l, i) => x.fillText(l, LX + 136, Y + 102 + i * 28));
    const cta = cont ? (zh() ? `继续 · 第 ${pad(run.i)} 步` : `Continue · step ${pad(run.i)}`) : (zh() ? `开始第 ${(Q.ROUNDS[c] || 0) + 1} 轮` : `Start round ${(Q.ROUNDS[c] || 0) + 1}`);
    font(x, 22, 700); const cw = Math.max(x.measureText(cta).width + 74, cont ? 250 : 0), cx = LX + LW - 28 - cw, cy = cont ? Y + 18 : Y + h / 2 - 28;
    if (cont) {   // an unfinished round: "Start over" under "Continue" (its hit comes before the card's, so it wins)
      const arm = P.resetArm && P.resetArm.c === c && now - P.resetArm.at < RESET_MS; if (arm) P.slow = true; else if (P.resetArm && P.resetArm.c === c) P.resetArm = null;
      btn(cx, Y + 86, cw, 46, arm ? tx('再点一次确认', 'Tap again to confirm') : tx('重新开始', 'Start over'), 'act:reset:' + c, { kind: arm ? 'danger' : 'sec', icon: 'reset', size: 19, weight: arm ? 700 : 600, r: 23 });
    }
    rr(x, cx, cy, cw, 56, 28, '#ffffff'); x.fillStyle = '#0b6670'; x.textBaseline = 'middle'; x.fillText(cta, cx + Math.max(24, (cw - 40 - x.measureText(cta).width) / 2), cy + 29); x.textBaseline = 'alphabetic';
    icon(x, 'arrowR', cx + cw - 30 + 4 * hv, cy + 28, 20, '#0b6670', 2.8);
    const rp = P.ripple; if (rp && rp.act === act) { const q = (now - rp.t) / 460; if (q < 1) { x.save(); roundRect(x, LX, Y, LW, h, 24); x.clip(); x.globalAlpha = .3 * (1 - q); x.fillStyle = '#fff'; x.beginPath(); x.arc(rp.x, rp.y, 20 + eOut(q) * 700, 0, 7); x.fill(); x.restore(); P.need = true; } }
    hits.push({ x: LX, y, w: LW, h, act }); y += h + 18;
  }
  // right column: the last round, or how it works
  const last = Q.roundSummary(Q.LAST); let ry = 146;
  rr(x, RX, ry, RW, PH - 36 - ry, 24, COL.surf); rrs(x, RX, ry, RW, PH - 36 - ry, 24, COL.line, 1.5);
  const ix = RX + 26, iw = RW - 52; ry += 40;
  if (last) {
    label(x, zh() ? '上一轮' : 'LAST ROUND', ix, ry, COL.accent); ry += 38;
    font(x, 26, 700); x.fillStyle = COL.ink; x.fillText(last.title, ix, ry, iw); ry += 30;
    font(x, 20); x.fillStyle = COL.ink2; x.fillText(zh() ? `第 ${last.round} 轮` : `Round ${last.round}`, ix, ry, iw); ry += 22;
    const stat = (lab, val, sx) => { font(x, 17, 600); x.fillStyle = COL.ink3; x.fillText(lab, sx, ry + 26); font(x, 40, 600, true); x.fillStyle = COL.ink; x.fillText(val, sx, ry + 72); };
    stat(zh() ? '用时' : 'TIME', Q.fmtDur(last.dur), ix); stat(zh() ? '完成' : 'DONE', `${last.done}/${last.total}`, ix + iw / 2); ry += 96;
    const flags = [];
    if (last.ended) flags.push([zh() ? '已停止并升级处理' : 'Stopped, escalated', COL.crit]);
    if (last.failed) flags.push([zh() ? 'FAIL：换新试纸再做一轮' : 'FAIL: repeat with a new strip', COL.warn]);
    if (last.cat) flags.push([last.cat, COL.accent]);
    if (last.overrides) flags.push([`${zh() ? '讲师放行' : 'Instructor passes'} ${last.overrides}`, COL.warn]);
    if (last.events) flags.push([`${zh() ? '异常记录' : 'Events'} ${last.events}`, COL.ink2]);
    for (const [txt, col] of flags) { font(x, 19, 600); const w = Math.min(iw, x.measureText(txt).width + 30); rr(x, ix, ry, w, 36, 18, rgba(col, .18)); x.fillStyle = col; x.fillText(txt, ix + 15, ry + 25, w - 24); ry += 44; }
    ry += 10;
    if (last.pending.length) {
      label(x, zh() ? '待护士核对 · 点一下确认' : 'TO CONFIRM · TAP WHEN CHECKED', ix, ry + 12, '#c9b8ff'); ry += 26;
      for (const pd of last.pending) { if (ry + 62 > PH - 50) break; btn(ix, ry, iw, 60, `${pd.ref} · ${pd.step}`, `act:nurse:${pd.no}:${pd.id}`, { kind: 'pend', size: 19, weight: 500, icon: 'check', align: 'left' }); ry += 70; }
    } else { icon(x, 'check', ix + 12, ry + 14, 22, COL.pass, 3); font(x, 21, 500); x.fillStyle = '#86e6b6'; x.fillText(zh() ? '没有待核对的项目' : 'Nothing left to confirm', ix + 34, ry + 21, iw - 34); }
  } else {
    label(x, zh() ? '怎么用' : 'HOW IT WORKS', ix, ry, COL.accent); ry += 26;
    const how = zh() ? ['每段开始先自动播放示范视频', '照着设备操作，屏幕识别通过后，点视野里的绿色卡片确认', '设备看不到的动作：每步一张清单，点一次「已完成」', '一轮结束后自动回到这里']
      : ['Each segment opens with its demonstration video', 'Operate the meter; when the screen is recognised, tap the green card in view', 'What the meter cannot see: one checklist per step, tap “Done” once', 'After each round you come back here'];
    how.forEach((l, i) => {
      font(x, 21); const ls = wrapText(x, l, iw - 52, 3);
      x.beginPath(); x.arc(ix + 16, ry + 30, 16, 0, 7); x.strokeStyle = COL.accent; x.lineWidth = 2; x.stroke();
      font(x, 17, 600, true); x.fillStyle = COL.accent; x.textAlign = 'center'; x.fillText(String(i + 1), ix + 16, ry + 36); x.textAlign = 'left';
      font(x, 21); x.fillStyle = COL.ink; ls.forEach((t2, j) => x.fillText(t2, ix + 46, ry + 37 + j * 29)); ry += 22 + ls.length * 29 + 14;
    });
  }
}

function drawVideo(P, x, hits, btn, y, vmod, vname) {
  const v = vidEl(), k = Math.max(0, vmod.videos.indexOf(vname)), nv = vmod.videos.length, by = BY0;
  const vh = Math.min(436, by - 54 - y), vw = Math.round(vh * 16 / 9), vx = LX + Math.round((LW - vw) / 2);
  rr(x, vx, y, vw, vh, 18, '#000');
  const ok = v.readyState >= 2 && !VID.err;
  if (ok) P.vidRect = { x: vx, y, w: vw, h: vh };
  else {
    icon(x, 'play', vx + vw / 2, y + vh / 2 - 30, 54, 'rgba(255,255,255,0.7)');
    x.textAlign = 'center'; font(x, 22, 500); x.fillStyle = VID.err ? '#ffb4a6' : COL.ink2;
    x.fillText(VID.err ? (zh() ? '无法播放（文件缺失或格式不支持）' : 'Cannot play (missing file or format)') : (zh() ? '视频加载中…' : 'Loading video…'), vx + vw / 2, y + vh / 2 + 34, vw - 40);
    font(x, 16, 400, true); x.fillStyle = COL.ink3; x.fillText(vname || '', vx + vw / 2, y + vh / 2 + 64, vw - 40); x.textAlign = 'left';
  }
  hits.push({ x: vx, y, w: vw, h: vh, act: 'vid:toggle' });
  const dur = v.duration, cur = v.currentTime || 0, py = y + vh + 14;
  rr(x, vx, py, vw, 6, 3, 'rgba(255,255,255,0.14)'); if (isFinite(dur) && dur > 0) rr(x, vx, py, Math.max(6, vw * cur / dur), 6, 3, COL.accent);
  font(x, 17, 500, true); x.fillStyle = COL.ink2; x.fillText(`${fmtT(cur)} / ${fmtT(dur)}`, vx, py + 30);
  if (v.muted && !v.paused) { font(x, 18, 500); x.fillStyle = '#ffd9a3'; x.textAlign = 'right'; x.fillText(zh() ? '静音播放中 · 点画面开声音' : 'Playing muted · tap the picture for sound', vx + vw, py + 30); x.textAlign = 'left'; }
  const playing = !(v.paused || v.ended);
  // after the last video of the segment ends, the main button counts down 7 s, then acts by itself
  const now = P.now, endK = VID.endAt && VID.endName === vname && k === nv - 1 ? (now - VID.endAt) / Q.VIDEO_MS : null, endS = endK != null ? Math.max(1, Math.ceil((1 - endK) * Q.VIDEO_MS / 1000)) : 0;
  if (endK != null && endK >= 1) { VID.endAt = 0; setTimeout(() => { if (S.view === 'intro') Q.startModule(); else if (MR.panel) { MR.panel.vidOpen = false; MR.dirty = true; } }, 0); }
  if (endK != null) { P.need = true; font(x, 19, 600); x.fillStyle = '#86e6b6'; x.textAlign = 'right'; x.fillText(S.view === 'intro' ? tx(`${endS} 秒后自动开始这一步 · 点按钮马上开始`, `Starting the step in ${endS} s · tap to start now`) : tx(`${endS} 秒后自动回到步骤`, `Back to the step in ${endS} s`), vx + vw, py + 30); x.textAlign = 'left'; }
  btn(LX, by, 150, 72, zh() ? '从头' : 'Restart', 'vid:restart', { icon: 'restart', size: 22 });
  btn(LX + 162, by, 186, 72, playing ? (zh() ? '暂停' : 'Pause') : (zh() ? '播放' : 'Play'), 'vid:toggle', { icon: playing ? 'pause' : 'play', kind: 'pri', size: 23, weight: 700 });
  if (nv > 1) btn(LX + 360, by, 140, 72, `${k + 1}/${nv}`, 'vid:next', { icon: 'skip', size: 22 });
  const cdo = endK != null ? { fillK: endK, glow: true } : {}, cds = endK != null ? ` · ${endS}` : '';
  if (S.view === 'intro') btn(LX + LW - 292, by, 292, 72, t('startModule', vmod.steps[0]).replace(' →', '') + cds, 'act:startmod', Object.assign({ kind: 'ok', size: 23, weight: 700, icon: 'arrowR', iconRight: true }, cdo));
  else btn(LX + LW - 240, by, 240, 72, (zh() ? '返回步骤' : 'Back to step') + cds, 'vid:close', Object.assign({ kind: 'ok', size: 23, weight: 700, icon: 'arrowL' }, cdo));
  // right column: what this segment teaches
  const Lm = L(vmod); let ry = 146;
  rr(x, RX, ry, RW, PH - 36 - ry, 24, COL.surf); rrs(x, RX, ry, RW, PH - 36 - ry, 24, COL.line, 1.5);
  const ix = RX + 24, iw = RW - 48; ry += 38;
  label(x, `${t('moduleN', Q.C.modules.indexOf(vmod) + 1)}${nv > 1 ? ` · ${k + 1}/${nv}` : ''}`, ix, ry, COL.accent, iw); ry += 30;
  if (Lm.video && Lm.video[k]) { font(x, 23, 700); x.fillStyle = COL.ink; wrapText(x, Lm.video[k], iw, 2).forEach(l => { x.fillText(l, ix, ry + 6, iw); ry += 30; }); ry += 14; }
  const list = (head, items, col, ic) => {
    if (!items || !items.length) return; font(x, 18, 600); x.fillStyle = COL.ink3; x.fillText(head, ix, ry, iw); ry += 30;
    for (const it of items) { font(x, 21); const ls = wrapText(x, it, iw - 26, 3); if (ry + ls.length * 28 > PH - 52) return;
      if (ic) icon(x, ic, ix + 9, ry - 7, 18, col, 2.4); else { x.beginPath(); x.arc(ix + 7, ry - 7, 4, 0, 7); x.fillStyle = col || COL.accent; x.fill(); }
      x.fillStyle = col && ic ? col : COL.ink; ls.forEach(l => { x.fillText(l, ix + 26, ry, iw - 26); ry += 28; }); ry += 6; }
    ry += 12;
  };
  list(t('learnTitle'), Lm.learn); list(t('watchTitle'), Lm.watch); list(t('warnTitle'), Lm.warn, '#ffd59a', 'warn');
}

function drawBlock(P, x, btn, y) {
  const R = Q.R, b = Q.branch(R.block.no, R.block.id), Lb = L(b);
  rr(x, LX, y, LW, 300, 24, 'rgba(230,103,79,0.16)'); rrs(x, LX, y, LW, 300, 24, 'rgba(230,103,79,0.5)', 2);
  icon(x, 'warn', LX + 50, y + 52, 34, '#ffb4a6', 2.6);
  label(x, t('blockTitle'), LX + 86, y + 46, '#ffb4a6');
  font(x, 30, 700); x.fillStyle = COL.ink; x.fillText(Lb.title, LX + 86, y + 88, LW - 120);
  font(x, 23); x.fillStyle = COL.ink; wrapText(x, Lb.body, LW - 120, 3).forEach((l, i) => x.fillText(l, LX + 86, y + 130 + i * 32));
  font(x, 20); x.fillStyle = COL.ink2; wrapText(x, Lb.ret, LW - 120, 2).forEach((l, i) => x.fillText(l, LX + 86, y + 240 + i * 28));
  const A = blockActs(), cols = A.length > 2 ? 2 : A.length, gap = 12, bw = (LW - gap * (cols - 1)) / cols, top = A.length > 2 ? BY0 - 84 : BY0;
  A.forEach((a, i) => btn(LX + (i % cols) * (bw + gap), top + Math.floor(i / cols) * 84, bw, 72, a.label, 'act:' + a.act, { kind: KIND_OF(a.kind), size: 21 }));
  drawRight(P, x, null, false);
}

/* the result row under a finished step's guide: check, "step done", recognised page / countdown */
function drawDoneRow(P, x, y, no, now) {
  const R = Q.R, ac = R.awaitConfirm === no, v = Q.rec(no).vision, seen = v && v.cls ? Q.scrName(v.cls) : '';
  const k = (now - P.sigAt) / 480; if (k < 1) P.need = true;
  rr(x, LX, y, LW, 96, 22, 'rgba(54,196,129,0.13)'); rrs(x, LX, y, LW, 96, 22, 'rgba(54,196,129,0.45)', 2);
  const sc = .4 + .6 * eBack(Math.min(1, Math.max(0, k))); x.save(); x.translate(LX + 52, y + 48); x.scale(sc, sc); x.beginPath(); x.arc(0, 0, 26, 0, 7); x.fillStyle = COL.pass; x.fill(); icon(x, 'check', 0, 1, 28, '#fff', 3.4); x.restore();
  font(x, 26, 700); x.fillStyle = COL.ink; x.fillText(t('stepDone'), LX + 96, y + 40, LW - 120);
  const au = Q.autoInfo(), secs = au ? Math.max(1, Math.ceil((au.at + au.ms - now) / 1000)) : 0;
  const sub = ac && au ? (seen ? tx(`已识别「${seen}」· ${secs} 秒后进入下一步，点绿色卡片或「下一步」可马上进入`, `“${seen}” recognised · next in ${secs} s — tap the green card or Next to go now`) : tx(`${secs} 秒后进入下一步`, `Next step in ${secs} s`))
    : ac ? (seen ? tx(`已识别「${seen}」，点绿色卡片或「下一步」确认`, `“${seen}” recognised — tap the green card or Next`) : tx('点「下一步」确认', 'Tap Next to confirm'))
    : au ? tx(`${secs} 秒后进入下一步`, `Next step in ${secs} s`) : (v && v.how ? visText(no) : '');
  font(x, 19); x.fillStyle = COL.ink2; wrapText(x, sub, LW - 120, 2).forEach((l, i) => x.fillText(l, LX + 96, y + 68 + i * 24, LW - 120));
}

function drawStep(P, x, hits, btn, y, no, s, sh) {
  const R = Q.R, now = P.now, { ms, show, cb, done } = sh, exam = R.mode === 'exam', by = BY0;
  if (show) {
    const Lm = L(show), open = !exam || R.hints[no + ':' + show.id], isCk = show.done === 'check';
    // measure, then trim to the space above the actions
    font(x, 32, 700); const tl = wrapText(x, Lm.t, LW - 64, 2);
    font(x, 23); let il = open && Lm.items ? Lm.items.map(it => wrapText(x, it, LW - 110, 2)) : [];
    font(x, 22); let dl = open && Lm.d ? wrapText(x, Lm.d, LW - 64, 3) : [];
    font(x, 20); let tip = open && Lm.tip ? wrapText(x, Lm.tip, LW - 120, 2) : [];
    const brs = visibleBranches(no), brH = brs.length ? 80 : 0, actH = done ? 108 : show.done === 'vision' ? 70 : 82, avail = by - 14 - actH - brH - y;
    const hOf = () => 78 + tl.length * 40 + il.reduce((a, l) => a + l.length * 31 + 8, 0) + (dl.length ? 10 + dl.length * 30 : 0) + (tip.length ? 12 + tip.length * 27 : 0) + 14;
    while (hOf() > avail && (tip.length || dl.length > 1 || il.length > 2)) { if (tip.length) tip = []; else if (dl.length > 1) { font(x, 22); dl = wrapText(x, Lm.d, LW - 64, dl.length - 1); } else il = il.slice(0, il.length - 1); }
    if (hOf() > avail && dl.length) dl = [];
    const ch = hOf();
    const scan = isScan(show), mc = scan ? COL.accent : TAPCOL, [mt, msub] = modeText(show);
    rr(x, LX, y, LW, ch, 24, COL.surf); rrs(x, LX, y, LW, ch, 24, scan ? rgba(COL.accent, .55) : 'rgba(255,255,255,0.24)', 2);
    // mode strip: SCAN (teal, viewfinder) or TAP (white, ring and dot like the cursor), with what to do; the index and the frame dots on the right
    const sX = LX + 12, sY = y + 10, sW = LW - 24, sH = 54, dots = scan && !Q.visionDone(no), rightW = (ms.length > 1 ? 66 : 0) + (dots ? CFG.hold * 28 + 10 : 0);
    rr(x, sX, sY, sW, sH, 18, scan ? rgba(COL.accent, .2) : 'rgba(255,255,255,0.1)');
    x.save(); roundRect(x, sX, sY, sW, sH, 18); x.clip(); x.fillStyle = mc; x.fillRect(sX, sY, 6, sH); x.restore();
    x.beginPath(); x.arc(sX + 40, sY + sH / 2, 19, 0, 7); x.fillStyle = mc; x.fill(); icon(x, scan ? 'scan' : 'tap', sX + 40, sY + sH / 2, 22, '#0b1a20', 2.8);
    font(x, 21, 700); spacing(x, zh() ? .5 : 1.3); x.fillStyle = scan ? COL.accentHi : '#ffffff'; x.fillText(mt, sX + 74, sY + 23, sW - 92 - rightW); spacing(x, 0);
    font(x, 18, 500); x.fillStyle = COL.ink2; x.fillText(msub, sX + 74, sY + 45, sW - 92 - rightW);
    if (ms.length > 1) { font(x, 17, 500, true); x.fillStyle = COL.ink3; x.textAlign = 'right'; x.fillText(`${ms.indexOf(show) + 1} / ${ms.length}`, sX + sW - 18, sY + 34); x.textAlign = 'left'; }
    if (dots) { const n = CFG.hold; for (let i = 0; i < n; i++) rr(x, sX + sW - 18 - (ms.length > 1 ? 66 : 0) - (n - i) * 28, sY + 23, 22, 8, 4, i < V.streak && curTargets().includes(V.cls) ? COL.pass : 'rgba(255,255,255,0.18)'); }
    let yy = y + 78;
    font(x, 32, 700); x.fillStyle = COL.ink; tl.forEach(l => { x.fillText(l, LX + 30, yy + 28, LW - 60); yy += 40; });
    il.forEach((ls, i) => {
      yy += 8;
      if (isCk) {
        // checkbox; when the checklist was just ticked, each box fills in turn
        const at = cb ? cb.at + 70 + i * 85 : null, kq = at != null ? (now - at) / 300 : done ? 9 : 0, on = (at != null && kq > 0) || done, pend = cb ? cb.st === 'pend' : done && Q.microState(no, show) === 'pend';
        const bxX = LX + 32, bxY = yy + 4, sz = 28;
        if (on) { const sc = .7 + .3 * eBack(kq); x.save(); x.translate(bxX + sz / 2, bxY + sz / 2); x.scale(sc, sc); rr(x, -sz / 2, -sz / 2, sz, sz, 8, pend ? COL.pend : COL.pass); if (pend) { font(x, 20, 800); x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText('?', 0, 7); x.textAlign = 'left'; } else icon(x, 'check', 0, 0, 20, '#fff', 3.6); x.restore(); }
        else rrs(x, bxX, bxY, sz, sz, 8, 'rgba(255,255,255,0.4)', 2.5);
      } else { x.beginPath(); x.arc(LX + 44, yy + 18, 5, 0, 7); x.fillStyle = COL.accent; x.fill(); }
      font(x, 23); x.fillStyle = COL.ink; ls.forEach((l, j) => x.fillText(l, LX + 76, yy + 27 + j * 31, LW - 110)); yy += ls.length * 31;
    });
    if (dl.length) { yy += 10; font(x, 22); x.fillStyle = COL.ink2; dl.forEach(l => { x.fillText(l, LX + 30, yy + 24, LW - 60); yy += 30; }); }
    if (tip.length) { yy += 12; icon(x, 'info', LX + 42, yy + 12, 20, COL.ink3, 2.2); font(x, 20); x.fillStyle = COL.ink3; tip.forEach(l => { x.fillText(l, LX + 64, yy + 20, LW - 96); yy += 27; }); }
    y += ch + 16;
    if (done) { drawDoneRow(P, x, y, no, now); y += 108; drawChips(P, x, hits, y, brs, by); }
    // actions for this small step
    const A = done ? [] : cb ? microActs(no, show).map(a => Object.assign({}, a, { act: 'noop:' + a.act })) : microActs(no, show);
    if (exam && !cb && !R.hints[no + ':' + show.id] && (Lm.d || Lm.items || Lm.tip)) A.push({ label: t('hint'), act: 'hint:' + show.id, kind: '', icon: 'info' });
    if (A.length) {
      const cols = A.length > 2 ? 2 : A.length, gap = 12, bw = (LW - gap * (cols - 1)) / cols, hh = show.done === 'decision' ? 60 : show.done === 'vision' ? 58 : 70;
      A.forEach((a, i) => {
        const ba = a.act.replace(/^noop:/, ''), ic2 = a.icon || (ba.startsWith('ck:') ? (ba.endsWith(':ok') ? 'check' : 'q') : ba === 'ovr' ? 'skip' : ba === 'rescan' ? 'reset' : null);
        btn(LX + (i % cols) * (bw + gap), y + Math.floor(i / cols) * (hh + 10), bw, hh, a.label, 'act:' + a.act, { kind: KIND_OF(a.kind), size: A.length > 2 || show.done === 'vision' ? 21 : 24, weight: a.kind === 'pri' || a.kind === 'tap' ? 700 : 600, icon: ic2 });
      });
      y += Math.ceil(A.length / cols) * (hh + 10) + 6;
    }
    // "if this happens" chips (branches of the flowchart)
    if (!done) drawChips(P, x, hits, y, brs, by);
  } else {
    // every small step is done: a check pops, then either "confirm" (screen recognised) or the auto-advance countdown on Next
    const ac = R.awaitConfirm === no, v = Q.rec(no).vision, seen = v && v.cls ? Q.scrName(v.cls) : '';
    const k = (now - P.sigAt) / 480; if (k < 1) P.need = true;
    rr(x, LX, y, LW, 132, 24, 'rgba(54,196,129,0.13)'); rrs(x, LX, y, LW, 132, 24, 'rgba(54,196,129,0.45)', 2);
    const sc = .4 + .6 * eBack(k); x.save(); x.translate(LX + 68, y + 66); x.scale(sc, sc); x.beginPath(); x.arc(0, 0, 32, 0, 7); x.fillStyle = COL.pass; x.fill(); icon(x, 'check', 0, 1, 34, '#fff', 3.6); x.restore();
    font(x, 30, 700); x.fillStyle = COL.ink; x.fillText(t('stepDone'), LX + 124, y + 58, LW - 150);
    font(x, 21); x.fillStyle = COL.ink2;
    const au0 = Q.autoInfo(), secs0 = au0 ? Math.max(1, Math.ceil((au0.at + au0.ms - now) / 1000)) : 0;
    const sub = ac && au0 ? (seen ? tx(`已识别「${seen}」· ${secs0} 秒后自动进入下一步，点绿色卡片或「下一步」可马上进入`, `“${seen}” recognised · next step in ${secs0} s — tap the green card or Next to go now`) : tx(`${secs0} 秒后自动进入下一步`, `Next step in ${secs0} s`))
      : ac ? (seen ? (zh() ? `已识别「${seen}」，点绿色卡片或「下一步」确认` : `“${seen}” recognised — tap the green card or Next`) : (zh() ? '点「下一步」确认' : 'Tap Next to confirm'))
      : Q.autoInfo() ? (zh() ? '马上自动进入下一步…' : 'Moving on in a moment…') : (v && v.how ? visText(no) : '');
    wrapText(x, sub, LW - 150, 2).forEach((l, i) => x.fillText(l, LX + 124, y + 92 + i * 28, LW - 150));
    y += 148;
    drawChips(P, x, hits, y, visibleBranches(no), by);
  }
  // footer: back · next (countdown fill while it moves on by itself, a breathing rim while it waits for confirmation)
  const ok = Q.complete() && !R.block, au = Q.autoInfo();
  btn(LX, by, 180, 72, t('prev'), 'act:prev', { disabled: no === 1, size: 23, icon: 'arrowL' });
  btn(LX + LW - 400, by, 400, 72, nextLabel() + (au && R.awaitConfirm === no ? ` · ${Math.max(1, Math.ceil((au.at + au.ms - now) / 1000))}` : ''), 'act:next', { disabled: !ok, kind: ok ? 'ok' : 'sec', size: 25, weight: 700, icon: Q.R.i === Q.STEPS.length ? 'check' : 'arrowR', iconRight: Q.R.i !== Q.STEPS.length, fillK: au ? (now - au.at) / au.ms : null, glow: ok && R.awaitConfirm === no });
  drawRight(P, x, show, true);
}

/* "if this happens" chips: the flowchart's side branches, recorded with one tap */
function drawChips(P, x, hits, y, brs, by) {
  if (!brs.length || y + 74 >= by) return;
  label(x, zh() ? '如果出现这些情况，点按记录' : 'IF THIS HAPPENS, TAP TO RECORD', LX, y + 16); y += 28;
  let bxx = LX;
  for (const b of brs) {
    font(x, 21, 500); const w = Math.min(390, x.measureText(L(b).title).width + 66);
    if (bxx + w > LX + LW) { bxx = LX; y += 56; } if (y + 46 > by - 8) break;
    const act = 'act:br:' + b.id, col = typeCol(b.type), hv = hoverAmt(P, act);
    rr(x, bxx, y, w, 46, 23, 'rgba(0,0,0,0.22)'); if (hv > 0) { x.globalAlpha = hv; rr(x, bxx, y, w, 46, 23, rgba(col, .22)); x.globalAlpha = 1; }
    rrs(x, bxx, y, w, 46, 23, rgba(col, .45 + .4 * hv), 1.5); icon(x, 'flag', bxx + 26, y + 23, 18, col, 2.2);
    const rp = P.ripple; if (rp && rp.act === act) { const q = (P.now - rp.t) / 460; if (q < 1) { x.save(); roundRect(x, bxx, y, w, 46, 23); x.clip(); x.globalAlpha = .3 * (1 - q); x.fillStyle = '#fff'; x.beginPath(); x.arc(rp.x, rp.y, 10 + eOut(q) * w, 0, 7); x.fill(); x.restore(); P.need = true; } }
    font(x, 21, 500); x.fillStyle = COL.ink; x.textBaseline = 'middle'; x.fillText(L(b).title, bxx + 44, y + 24, w - 58); x.textBaseline = 'alphabetic';
    hits.push({ x: bxx, y, w, h: 46, act }); bxx += w + 10;
  }
}

/* right column of a step: the page to recognise (or the reference picture), recognition status, the headset camera */
function drawRight(P, x, show, inStepView) {
  const R = Q.R, no = R.i, now = P.now;
  const vis = inStepView && Q.BY[no].vision && (!show || show.done === 'vision');
  let ry = 146;
  const tkey = vis ? (curTargets()[0] || null) : show ? (Q.scrList(show.scr)[0] || null) : null;
  if (tkey || vis) {
  label(x, vis ? (zh() ? '要识别的页面' : 'PAGE TO RECOGNISE') : (zh() ? '参考画面' : 'REFERENCE'), RX, ry + 16); ry += 30;
  const ih = 262; rr(x, RX, ry, RW, ih, 20, 'rgba(0,0,0,0.42)'); rrs(x, RX, ry, RW, ih, 20, COL.line, 1.5);
  const im = tkey && Q.thumbImg(tkey);
  if (im && im.complete && im.naturalWidth) { const sc = Math.min((RW - 24) / im.naturalWidth, (ih - 24) / im.naturalHeight), w = im.naturalWidth * sc, h = im.naturalHeight * sc; x.save(); roundRect(x, RX + (RW - w) / 2, ry + (ih - h) / 2, w, h, 10); x.clip(); x.drawImage(im, RX + (RW - w) / 2, ry + (ih - h) / 2, w, h); x.restore(); }
  else icon(x, 'scan', RX + RW / 2, ry + ih / 2, 44, 'rgba(255,255,255,0.25)', 2.2);
  ry += ih + 10;
  if (tkey) { font(x, 20); x.fillStyle = COL.ink2; wrapText(x, Q.scrName(tkey), RW, 2).forEach((l, i) => x.fillText(l, RX, ry + 20 + i * 26, RW)); }
  ry += 64;
  }
  // recognition status: a ring with this step's progress (same as the card in view)
  if (vis) {
    const sc = P.sc, st = sc ? sc.state : Q.visionDone(no) ? 'done' : 'search', col = SCAN_COL[st] || COL.accent, prog = sc ? P.scanShown : Q.visionDone(no) ? 1 : 0;
    rr(x, RX, ry, RW, 96, 20, COL.surf); rrs(x, RX, ry, RW, 96, 20, COL.line, 1.5);
    const cx = RX + 50, cy = ry + 48;
    x.lineWidth = 7; x.strokeStyle = 'rgba(255,255,255,0.12)'; x.beginPath(); x.arc(cx, cy, 28, 0, 7); x.stroke();
    if (prog > 0) { x.strokeStyle = col; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); x.stroke(); x.lineCap = 'butt'; }
    if (st === 'done' || st === 'confirm') icon(x, 'check', cx, cy, 24, col, 3.4); else { font(x, 16, 600, true); x.fillStyle = col; x.textAlign = 'center'; x.fillText(Math.round(prog * 100) + '', cx, cy + 6); x.textAlign = 'left'; }
    font(x, 23, 700); x.fillStyle = col === COL.accent ? COL.ink : col; x.fillText(tx(...SCAN_WORD[st] || SCAN_WORD.search), RX + 94, ry + 42, RW - 110);
    const RR = lastRes && now - lastRes.t < 2500 ? lastRes : null;
    font(x, 18); x.fillStyle = COL.ink2;
    const sub = RR && RR.probs ? (RR.read < Q.READ_MIN ? t('unreadable') : `${Q.scrName(CLASSES[Q.argmax(RR.probs)])} · ${Math.round(Math.max(...RR.probs) * 100)}%`) : RR && !RR.box ? t('noScreen') : (zh() ? '等待摄像头画面' : 'Waiting for the camera');
    x.fillText(sub, RX + 94, ry + 72, RW - 110);
    ry += 112;
  }
  // headset camera (for the trainer: what the recognition sees)
  const v = HM.video, top = vis ? Math.max(ry, PH - 36 - 128) : ry, h = Math.min(vis ? 320 : 210, PH - 36 - top - 26);
  label(x, zh() ? '头显摄像头' : 'HEADSET CAMERA', RX, top + 14); const cy0 = top + 26;
  rr(x, RX, cy0, RW, h, 16, '#05090c');
  if (HM.stream && v && v.videoWidth && h > 40) {
    const sc = Math.max(RW / v.videoWidth, h / v.videoHeight), dw = v.videoWidth * sc, dh = v.videoHeight * sc, ox = RX + (RW - dw) / 2, oy = cy0 + (h - dh) / 2;
    x.save(); roundRect(x, RX, cy0, RW, h, 16); x.clip(); x.drawImage(v, ox, oy, dw, dh);
    const res = HM.res;
    if (res && res.rect && now - (lastRes ? lastRes.t : 0) < 2000) { const q = dw / res.w; const okc = lastRes && lastRes.probs && curTargets().includes(CLASSES[Q.argmax(lastRes.probs)]) && Math.max(...lastRes.probs) >= CFG.th; x.strokeStyle = okc ? COL.pass : '#ffffff'; x.lineWidth = 3; x.strokeRect(ox + res.rect.x * q, oy + res.rect.y * (dh / res.h), res.rect.w * q, res.rect.h * (dh / res.h)); }
    x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(RX, cy0 + h - 26, RW, 26); font(x, 15, 400, true); x.fillStyle = '#e6eef1'; x.fillText(Q.camInfoText(v) + (HM.screenPx ? ` · ${zh() ? '屏幕' : 'screen'}≈${HM.screenPx}px` : ''), RX + 10, cy0 + h - 8, RW - 20);
    x.restore();
  } else if (h > 30) { font(x, 18); x.fillStyle = COL.ink3; wrapText(x, zh() ? '未开摄像头：识别步骤可用「讲师放行」' : 'No camera: use “Instructor pass” for screen steps', RW - 28, 2).forEach((l, i) => x.fillText(l, RX + 14, cy0 + 32 + i * 24)); }
}

/* scan prompt card (canvas → head-following plane in the upper part of the view) */
const SCW = 640, SCH = 200;
function drawScan(cv, sc, prog, time, hover) {
  const x = cv.getContext('2d'), col = SCAN_COL[sc.state] || COL.accent, conf = sc.state === 'confirm', done = sc.state === 'done' || conf, pc = Math.round(prog * 100);
  x.clearRect(0, 0, SCW, SCH);
  if (conf) { const g = x.createLinearGradient(0, 0, 0, SCH); g.addColorStop(0, hover ? '#2fc07f' : '#24a76b'); g.addColorStop(1, hover ? '#22a46b' : '#178052'); roundRect(x, 6, 6, SCW - 12, SCH - 12, 46); x.fillStyle = g; x.fill(); }
  else rr(x, 6, 6, SCW - 12, SCH - 12, 46, 'rgba(9,17,22,0.9)');
  x.globalAlpha = conf ? (hover ? 1 : .85) : .65; rrs(x, 6, 6, SCW - 12, SCH - 12, 46, conf ? '#c6f7dc' : col, conf && hover ? 5 : 3); x.globalAlpha = 1;
  const cx = 96, cy = SCH / 2;
  if (done) { x.beginPath(); x.arc(cx, cy, 46, 0, 7); x.fillStyle = conf ? '#ffffff' : col; x.fill(); icon(x, 'check', cx, cy + 1, 54, conf ? '#1b8a57' : '#0b141a', 4);
    if (conf && sc.cd != null) { x.lineWidth = 7; x.strokeStyle = 'rgba(255,255,255,0.28)'; x.beginPath(); x.arc(cx, cy, 58, 0, 7); x.stroke(); x.strokeStyle = '#ffffff'; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy, 58, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sc.cd); x.stroke(); x.lineCap = 'butt'; } }
  else {
    // viewfinder in a ring; the ring fills with the progress, the sweep line runs while searching
    x.strokeStyle = 'rgba(255,255,255,0.13)'; x.lineWidth = 7; x.beginPath(); x.arc(cx, cy, 46, 0, 7); x.stroke();
    if (prog > 0) { x.strokeStyle = col; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); x.stroke(); x.lineCap = 'butt'; }
    icon(x, 'scan', cx, cy, 40, col, 2.6);
    if (sc.state === 'search' || sc.state === 'other') { const ph = (time / 1300) % 1, ly = cy - 12 + 24 * (ph < .5 ? ph * 2 : 2 - ph * 2); x.globalAlpha = .9; x.strokeStyle = col; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx - 11, ly); x.lineTo(cx + 11, ly); x.stroke(); x.lineCap = 'butt'; x.globalAlpha = 1; }
  }
  const tx0 = 170, tw = SCW - 44 - tx0;
  if (conf) {
    font(x, 33, 700); x.fillStyle = '#ffffff'; x.fillText(sc.title, tx0, 86, tw);
    font(x, 23, 500); x.fillStyle = 'rgba(255,255,255,0.9)'; wrapText(x, sc.text, tw, 2).forEach((l, i) => x.fillText(l, tx0, 128 + i * 30, tw));
  } else {
    font(x, 32, 700); x.fillStyle = COL.ink; x.fillText(sc.title, tx0, 66, tw - 96);
    font(x, 30, 600, true); x.fillStyle = col; x.textAlign = 'right'; x.fillText(pc + '%', SCW - 44, 66); x.textAlign = 'left';
    rr(x, tx0, 84, tw, 12, 6, 'rgba(255,255,255,0.14)'); if (pc > 0) rr(x, tx0, 84, Math.max(12, tw * prog), 12, 6, col);
    font(x, 22, 500); x.fillStyle = sc.state === 'blur' || sc.state === 'err' ? col : '#dfecef'; wrapText(x, sc.text, tw, 2).forEach((l, i) => x.fillText(l, tx0, 134 + i * 29, tw));
  }
}

/* window bar under the panel: recentre · swap side · follow/pin · [grab] · language · exit */
function barItems(P) {
  return [
    { act: 'reset', icon: 'reset', t: zh() ? '复位' : 'Recentre', w: 146 }, { act: 'side', icon: 'swap', t: zh() ? '换边' : 'Swap', w: 146 },
    { act: 'follow', icon: P.follow ? 'follow' : 'pin', t: P.follow ? (zh() ? '跟随中' : 'Following') : (zh() ? '已固定' : 'Pinned'), w: 166 },
    { act: 'grab', w: 320, gap: 24 }, { act: 'lang', t: zh() ? 'EN' : '中', w: 92, gap: 24 }, { act: 'exit', icon: 'close', t: zh() ? '退出 MR' : 'Exit MR', w: 166 },
  ];
}
function drawBar(P) {
  const x = P.bctx, hits = [], items = barItems(P), now = P.now;
  x.clearRect(0, 0, BW, BH);
  const total = items.reduce((a, it, i) => a + it.w + (i ? (it.gap || 12) : 0), 0);
  let bx = (BW - total) / 2;
  items.forEach((it, i) => {
    if (i) bx += it.gap || 12;
    const Y = 18, H = 68, r = 34, hv = it.act === 'grab' ? 0 : hoverAmt(P, it.act);
    if (it.act === 'grab') {
      const on = P.handleHover, grab = !!P.grab;
      rr(x, bx, Y, it.w, H, r, grab ? 'rgba(33,165,107,0.96)' : on ? 'rgba(240,248,250,0.95)' : 'rgba(10,18,23,0.86)');
      const ink = grab ? '#ffffff' : on ? '#0b141a' : '#dfe8eb';
      icon(x, 'grip', bx + 36, Y + H / 2, 24, ink);
      font(x, 21, 600); x.fillStyle = ink; x.textBaseline = 'middle';
      x.fillText(grab ? (zh() ? '移动中 · 摇杆调远近／大小' : 'Moving · stick: distance / size') : (zh() ? '按住拖动面板' : 'Hold to move'), bx + 62, Y + H / 2 + 1, it.w - 80); x.textBaseline = 'alphabetic';
      hits.push({ x: bx, y: Y, w: it.w, h: H, act: 'grab' });
    } else {
      const exit = it.act === 'exit';
      rr(x, bx, Y, it.w, H, r, 'rgba(10,18,23,0.86)');
      if (hv > 0) { x.globalAlpha = hv; rr(x, bx, Y, it.w, H, r, exit ? 'rgba(230,103,79,0.85)' : 'rgba(60,177,187,0.75)'); x.globalAlpha = 1; }
      rrs(x, bx, Y, it.w, H, r, 'rgba(255,255,255,' + (.14 + .4 * hv) + ')', 1.5);
      const rp = P.ripple; if (rp && rp.act === it.act && rp.bar) { const q = (now - rp.t) / 460; if (q < 1) { x.save(); roundRect(x, bx, Y, it.w, H, r); x.clip(); x.globalAlpha = .35 * (1 - q); x.fillStyle = '#fff'; x.beginPath(); x.arc(rp.x, rp.y, 10 + eOut(q) * 200, 0, 7); x.fill(); x.restore(); P.need = true; } }
      font(x, 21, 600); const tw = x.measureText(it.t).width, iw = it.icon ? 24 : 0, g = it.icon ? 10 : 0, sx = bx + (it.w - tw - iw - g) / 2;
      if (it.icon) icon(x, it.icon, sx + iw / 2, Y + H / 2, 22, '#e6eff2', 2.4);
      x.fillStyle = '#e6eff2'; x.textBaseline = 'middle'; x.fillText(it.t, sx + iw + g, Y + H / 2 + 1); x.textBaseline = 'alphabetic';
      hits.push({ x: bx, y: Y, w: it.w, h: H, act: it.act });
    }
    bx += it.w;
  });
  P.barHits = hits;
}

function buildPanel(scene, renderer) {
  const canvas = document.createElement('canvas'); canvas.width = PW; canvas.height = PH;
  const tex = new THREE.CanvasTexture(canvas); tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, opacity: 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), mat);
  mesh.visible = false; scene.add(mesh);
  // soft shadow behind the panel, so it reads against bright rooms
  const shC = document.createElement('canvas'); shC.width = 256; shC.height = 176; const shx = shC.getContext('2d'); shx.filter = 'blur(13px)'; rr(shx, 28, 28, 200, 120, 16, 'rgba(0,0,0,0.75)');
  const shMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shC), transparent: true, depthWrite: false, opacity: 0 });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W * 256 / 200, PANEL_H * 176 / 120), shMat); shadow.position.set(0, -.008, -.006); shadow.renderOrder = -1; mesh.add(shadow);
  // window bar under the panel (grab + tools)
  const bCanvas = document.createElement('canvas'); bCanvas.width = BW; bCanvas.height = BH; const bTex = new THREE.CanvasTexture(bCanvas); bTex.anisotropy = 4;
  const bMat = new THREE.MeshBasicMaterial({ map: bTex, transparent: true, side: THREE.DoubleSide, opacity: 0 });
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(BAR_W, BAR_H), bMat);
  bar.position.set(0, -PANEL_H / 2 - BAR_H / 2 - .006, .001); mesh.add(bar);
  // scan prompt: follows the head in the upper part of the view while a screen check runs (never drawn on the meter)
  const sCanvas = document.createElement('canvas'); sCanvas.width = SCW; sCanvas.height = SCH; const sTex = new THREE.CanvasTexture(sCanvas); sTex.anisotropy = 4;
  const sMat = new THREE.MeshBasicMaterial({ map: sTex, transparent: true, depthTest: false, side: THREE.DoubleSide, opacity: 0 });
  const scanHud = new THREE.Mesh(new THREE.PlaneGeometry(SCAN_W, SCAN_W * SCH / SCW), sMat);
  scanHud.visible = false; scanHud.renderOrder = 20; scene.add(scanHud);
  // segment video: a VideoTexture plane placed over P.vidRect (panel pixels) whenever the panel shows a video
  const vTex = new THREE.VideoTexture(vidEl());
  const vMat = new THREE.MeshBasicMaterial({ map: vTex, side: THREE.DoubleSide, toneMapped: false, transparent: true });
  const vMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), vMat);
  vMesh.visible = false; vMesh.renderOrder = 1; mesh.add(vMesh);
  // 3D demo window (fx3d.js): docked to the panel's inner edge for steps that have an animation (QC 04 on); moves and scales with the panel
  const FX = window.FX3D || null, stage = FX ? FX.stage() : null;
  const FX_SCALE = 1.5;   // the 3D demo window, 1.5× its first size (27 × 21 cm → 40 × 31 cm)
  if (stage) { stage.visible = false; mesh.add(stage); }
  // scan guide: the first screen scan of each round opens with a short guide in the view, which then shrinks into the scan card
  const gCanvas = FX ? Object.assign(document.createElement('canvas'), { width: FX.GW, height: FX.GH }) : null, gTex = gCanvas ? new THREE.CanvasTexture(gCanvas) : null;
  const gMat = gTex ? new THREE.MeshBasicMaterial({ map: gTex, transparent: true, depthTest: false, opacity: 0 }) : null;
  const guide = gMat ? new THREE.Mesh(new THREE.PlaneGeometry(1, FX.GH / FX.GW), gMat) : null;
  if (guide) { guide.visible = false; guide.renderOrder = 21; scene.add(guide); }
  const DEF_YAW = Math.atan2(.34, .68), DEF_DIST = Math.hypot(.34, .68), DEF_DY = -.05;
  const P = { canvas, ctx: canvas.getContext('2d'), tex, mesh, handle: bar, bar, bctx: bCanvas.getContext('2d'), scanHud, hits: [], barHits: [], hover: null, hv: {}, follow: false, side: -1, placed: false, moving: false, lastDraw: 0,
    rel: { yaw: -DEF_YAW, dist: DEF_DIST, dy: DEF_DY }, scale: 1, grab: null, handleHover: false, scanShown: 0, scanVis: 0, scanSig: '', lastT: 0, born: 0, sc: null, now: performance.now(), dt: 16 };
  // the panel opens pinned (team request 11-09): it stays where it was put; Recentre / Swap bring it back in front once and keep the pinned / following choice
  P.resetRel = () => { P.rel = { yaw: P.side * DEF_YAW, dist: DEF_DIST, dy: DEF_DY }; P.scale = 1; P.moving = true; };
  const SETTLE_MS = 500;   // the first half second after it appears it still sits where you look (first head poses can jump), then it stays put
  P.fx = { guide, stage };   // for tests
  MR.panel = P; MR.dirty = true;
  // pointer: a tapered ray that fades toward the cursor, and a cursor ring that grows over controls and shrinks on press
  const rayAlpha = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#262626'); gr.addColorStop(.45, '#9a9a9a'); gr.addColorStop(.9, '#f2f2f2'); gr.addColorStop(1, '#3a3a3a'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); })();
  const rayGeo = new THREE.CylinderGeometry(.0007, .0019, 1, 12, 1, true); rayGeo.rotateX(-Math.PI / 2); rayGeo.translate(0, 0, -.5);
  const ray = new THREE.Raycaster(), tmpM = new THREE.Matrix4();
  const setRay = ctl => { tmpM.identity().extractRotation(ctl.matrixWorld); ray.ray.origin.setFromMatrixPosition(ctl.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM); };
  const pick = ctl => { if (!mesh.visible) return null; setRay(ctl); return ray.intersectObjects(P.scanClick && scanHud.visible ? [scanHud, bar, mesh] : [bar, mesh], false)[0] || null; };
  const barHitAt = hit => { const px = hit.uv.x * BW, py = (1 - hit.uv.y) * BH; const h = P.barHits.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); return h ? { act: h.act, px, py } : null; };
  const startGrab = (ctl, anywhere) => { if (P.grab) return false; const hit = pick(ctl); if (!hit || hit.object === scanHud) return false; if (!anywhere) { if (hit.object !== bar) return false; const bh = barHitAt(hit); if (!bh || bh.act !== 'grab') return false; } P.grab = { ctl, dist: hit.distance, offset: mesh.position.clone().sub(hit.point) }; P.moving = false; MR.dirty = true; return true; };
  const endGrab = ctl => { if (!P.grab || P.grab.ctl !== ctl) return; P.grab = null; P.storeRel(); MR.dirty = true; };
  const ctrls = [0, 1].map(i => {
    const ctl = renderer.xr.getController(i);
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xffffff, alphaMap: rayAlpha, transparent: true, depthWrite: false });
    const rayMesh = new THREE.Mesh(rayGeo, rayMat); rayMesh.scale.z = .6; ctl.add(rayMesh);
    const cur = new THREE.Group(), ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, depthTest: false }), dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, depthTest: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(.0045, .0064, 40), ringMat), dot = new THREE.Mesh(new THREE.CircleGeometry(.0023, 24), dotMat);
    ring.renderOrder = dot.renderOrder = 40; cur.add(ring, dot); cur.visible = false; scene.add(cur);
    const c = { ctl, rayMesh, rayMat, cur, ring, dot, ringMat, hov: 0, prs: 0, lastAct: null };
    ctl.addEventListener('connected', e => { ctl.userData.src = e.data; });
    ctl.addEventListener('disconnected', () => { ctl.userData.src = null; cur.visible = false; endGrab(ctl); });
    ctl.addEventListener('selectstart', () => { ctl.userData.pressing = true; startGrab(ctl, false); });
    ctl.addEventListener('selectend', () => { ctl.userData.pressing = false; endGrab(ctl); });
    ctl.addEventListener('squeezestart', () => startGrab(ctl, true));
    ctl.addEventListener('squeezeend', () => endGrab(ctl));
    ctl.addEventListener('select', () => { if (P.grab) return; const h = ctl.userData.hit; if (!h || h.act === 'grab') return; P.ripple = { act: h.act, x: h.px, y: h.py, t: performance.now(), bar: !!h.bar }; panelAction(h.act, ctl); });
    scene.add(ctl);
    return c;
  });
  const headQ = new THREE.Quaternion(), head = new THREE.Vector3(), fwd = new THREE.Vector3(), tgt = new THREE.Vector3(), right = new THREE.Vector3(), flat = new THREE.Vector3(), hudTgt = new THREE.Vector3(), up = new THREE.Vector3(), accentC = new THREE.Color(COL.accentHi), whiteC = new THREE.Color(0xffffff), grabC = new THREE.Color(0x43d18f);
  const relToPos = out => { const d = flat.clone().multiplyScalar(Math.cos(P.rel.yaw)).addScaledVector(right, Math.sin(P.rel.yaw)); return out.copy(head).addScaledVector(d, P.rel.dist).setY(head.y + P.rel.dy); };
  P.storeRel = () => { const v = mesh.position.clone().sub(head), fv = new THREE.Vector3(v.x, 0, v.z); P.rel = { yaw: Math.atan2(fv.dot(right), fv.dot(flat)), dist: Math.max(.3, fv.length()), dy: v.y }; };
  P.update = (time) => {
    const now = performance.now();
    const cam = renderer.xr.getCamera(AR.camera);
    head.setFromMatrixPosition(cam.matrixWorld); headQ.setFromRotationMatrix(cam.matrixWorld); fwd.set(0, 0, -1).applyQuaternion(headQ); up.set(0, 1, 0).applyQuaternion(headQ);
    flat.set(fwd.x, 0, fwd.z); if (flat.lengthSq() < 1e-4) flat.set(0, 0, -1); flat.normalize(); right.set(-flat.z, 0, flat.x);
    if (P.grab) {
      const g = P.grab, gp = g.ctl.userData.src && g.ctl.userData.src.gamepad;
      if (gp && gp.axes && gp.axes.length >= 4) {
        const ax = gp.axes[2], ay = gp.axes[3];
        if (Math.abs(ay) > .15) g.dist = Math.min(2.2, Math.max(.3, g.dist - ay * .012));
        if (Math.abs(ax) > .15) P.scale = Math.min(1.7, Math.max(.55, P.scale * (1 + ax * .015)));
      }
      setRay(g.ctl); mesh.position.copy(ray.ray.origin).addScaledVector(ray.ray.direction, g.dist).add(g.offset);
    } else {
      relToPos(tgt);
      if (!P.placed) { mesh.position.copy(tgt); P.placed = true; mesh.visible = true; P.born = now; }
      else if (now - P.born < SETTLE_MS) mesh.position.copy(tgt);
      else if (P.follow || P.moving) {
        if (P.follow && mesh.position.distanceTo(tgt) > .38 * Math.max(1, P.rel.dist / DEF_DIST)) P.moving = true;
        if (P.moving) { mesh.position.lerp(tgt, .07); if (mesh.position.distanceTo(tgt) < .02) P.moving = false; }
      }
    }
    mesh.lookAt(head);
    // panel entrance: fade + slight scale-up
    const ek = eOut((now - P.born) / 380);
    mat.opacity = ek; bMat.opacity = ek; shMat.opacity = .38 * ek; mesh.scale.setScalar(P.scale * (.95 + .05 * ek));
    // scan prompt: eased toward a fixed spot in the view (slightly above centre, so the meter in your hands stays clear); fades/rises in, pops on success, breathes while it waits for a tap
    const dt = P.lastT ? Math.min(.2, (time - P.lastT) / 1000) : 0; P.lastT = time;
    const sc = scanState(); P.sc = sc;
    // the guide starts with the round's first screen scan (not when the camera is missing), and ends when it has shrunk into the card or the step moves on
    if (guide && sc && Q.R && !Q.R.guided && inStep() && ['search', 'other', 'lock', 'blur'].includes(sc.state)) { Q.R.guided = true; P.guideAt = now; }
    if (P.guideAt != null && (!sc || now - P.guideAt >= FX.GUIDE_MS + FX.MORPH_MS)) P.guideAt = null;
    const gms = P.guideAt != null ? now - P.guideAt : null;
    ray.ray.origin.copy(head); ray.ray.direction.copy(fwd); const gh = mesh.visible ? ray.intersectObject(mesh, false)[0] : null, gaze = !!(gh && gh.uv && gh.uv.x > .08 && gh.uv.x < .92 && gh.uv.y > .1 && gh.uv.y < .9);   // reading the panel (not just grazing its edge)
    const pv = tgt.copy(mesh.position).sub(head), pyaw = Math.atan2(pv.dot(right), pv.dot(flat)), side = Math.abs(pyaw) < .9 ? -Math.sign(pyaw) * SCAN_SIDE : 0;
    const want = sc ? ((gaze && !P.grab) || (gms != null && gms < FX.GUIDE_MS) ? 0 : 1) : 0;   // the card waits while the guide is up
    P.scanVis += (want - P.scanVis) * (1 - Math.exp(-dt / .09)); if (!want && P.scanVis < .02) P.scanVis = 0;
    if (sc) {
      if (!scanHud.visible) { hudTgt.set(side, SCAN_UP * SCAN_D, -SCAN_D).applyQuaternion(headQ).add(head); scanHud.position.copy(hudTgt); scanHud.quaternion.copy(headQ); P.scanShown = sc.prog; }
      else P.scanShown += (sc.prog - P.scanShown) * (1 - Math.exp(-dt / .18));
      if (Math.abs(sc.prog - P.scanShown) < .004 || sc.state === 'done' || sc.state === 'confirm') P.scanShown = sc.prog;
      if ((sc.state === 'done' || sc.state === 'confirm') && P.scanLast !== 'done' && P.scanLast !== 'confirm') P.scanPopAt = now;
      const anim = sc.state === 'search' || sc.state === 'other' ? Math.floor(time / 70) : 0;
      const sig = [sc.state, sc.title, sc.text, Math.round(P.scanShown * 200), anim, S.lang, P.hover === 'scan', sc.cd != null ? Math.round(sc.cd * 150) : ''].join('|');
      if (sig !== P.scanSig) { P.scanSig = sig; drawScan(sCanvas, sc, P.scanShown, time, P.hover === 'scan'); sTex.needsUpdate = true; }
    }
    P.scanLast = sc ? sc.state : null;
    scanHud.visible = P.scanVis > 0;
    if (scanHud.visible) {
      hudTgt.set(side, SCAN_UP * SCAN_D, -SCAN_D).applyQuaternion(headQ).add(head).addScaledVector(up, -(1 - P.scanVis) * .014);
      const k = 1 - Math.exp(-dt / .06); scanHud.position.lerp(hudTgt, k); scanHud.quaternion.slerp(headQ, k);
      const pk = (now - (P.scanPopAt || -1e9)) / 420, pop = pk < 1 ? Math.sin(Math.PI * pk) * .08 : 0, breath = sc && sc.state === 'confirm' ? Math.sin(now / 1000 * Math.PI * 1.25) * .016 : 0;
      scanHud.scale.setScalar((.94 + .06 * P.scanVis) * (1 + pop + breath)); sMat.opacity = P.scanVis;
    }
    P.scanClick = !!(sc && sc.state === 'confirm') && P.scanVis > .5;
    if (guide) {
      const was = guide.visible; guide.visible = gms != null;
      if (guide.visible) {
        FX.drawGuide(gCanvas, Math.min(gms, FX.GUIDE_MS)); gTex.needsUpdate = true;
        const morph = FX.io(Math.max(0, (gms - FX.GUIDE_MS) / FX.MORPH_MS)), appear = FX.io(Math.min(1, gms / 280));
        hudTgt.set(FX.lerp(.015, side, morph), FX.lerp(-.025, SCAN_UP * SCAN_D, morph), -SCAN_D).applyQuaternion(headQ).add(head);
        if (!was) { guide.position.copy(hudTgt); guide.quaternion.copy(headQ); } else { const k = 1 - Math.exp(-dt / .06); guide.position.lerp(hudTgt, k); guide.quaternion.slerp(headQ, k); }
        const w = FX.lerp(.3, SCAN_W, morph) * (.94 + .06 * appear); guide.scale.set(w, w, 1); gMat.opacity = appear * (1 - morph);
      }
    }
    // the 3D window: on the panel's edge nearer the centre of view (swaps with the panel), only in a step that has an animation
    if (stage) {
      const R = Q.R, on = mesh.visible && inStep() && !R.block && !P.vidOpen && stage.userData.has(Q.C.id, R.i, (Q.curMicro(R.i) || {}).id);
      stage.visible = on;
      if (on) {
        const inner = pyaw < 0 ? 1 : -1, sw = stage.userData.width * FX_SCALE, sh = stage.userData.height * FX_SCALE, a = .55; stage.scale.setScalar(FX_SCALE);   // 11-09: 1.5× (team request)
        stage.position.set(inner * (PANEL_W / 2 + .006 + sw / 2 * Math.cos(a)), -PANEL_H / 2 + sh / 2 - .06, .02 + sw / 2 * Math.sin(a));   // 6 cm lower: clear of the scan card stage.rotation.y = -inner * a;
        stage.userData.setStep(Q.C.id, R.i, Q.ref(R.i)); stage.userData.update(now);
      }
    }
    // pointers
    let hover = null, hHover = false;
    for (const c of ctrls) {
      c.ctl.userData.hit = null;
      if (!c.ctl.userData.src) { c.cur.visible = false; continue; }
      const grabbing = P.grab && P.grab.ctl === c.ctl, hit = pick(c.ctl);
      let act = null, on = null;
      if (hit) {
        if (hit.object === bar) { const bh = hit.uv ? barHitAt(hit) : null; if (bh) { act = bh.act; c.ctl.userData.hit = { act: bh.act, px: bh.px, py: bh.py, bar: true }; if (bh.act === 'grab') hHover = true; else hover = bh.act; } on = bar; }
        else if (hit.object === scanHud) { act = 'scan'; c.ctl.userData.hit = { act: 'act:next' }; hover = 'scan'; on = scanHud; }
        else if (hit.uv && !P.grab) { const px = hit.uv.x * PW, py = (1 - hit.uv.y) * PH; const h = P.hits.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h); if (h) { act = h.act; hover = h.act; c.ctl.userData.hit = { act: h.act, px, py }; } on = mesh; }
        c.rayMesh.scale.z = hit.distance; c.cur.visible = true; c.cur.position.copy(hit.point).addScaledVector(fwd, -.003);
        if (on === scanHud) c.cur.quaternion.copy(scanHud.quaternion); else c.cur.quaternion.copy(mesh.quaternion);
      } else { c.rayMesh.scale.z = grabbing ? P.grab.dist : .6; c.cur.visible = false; }
      if (act && act !== c.lastAct) { try { const gp = c.ctl.userData.src.gamepad; gp && gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse(.12, 12); } catch (e) {} }
      c.lastAct = act;
      const ka = 1 - Math.exp(-dt / .07);
      c.hov += ((act ? 1 : 0) - c.hov) * ka; c.prs += ((c.ctl.userData.pressing ? 1 : 0) - c.prs) * (1 - Math.exp(-dt / .04));
      c.ring.scale.setScalar(1 + .5 * c.hov - .3 * c.prs); c.dot.scale.setScalar(1 + .5 * c.prs);
      c.ringMat.color.copy(whiteC).lerp(accentC, c.hov); c.rayMat.color.copy(grabbing ? grabC : whiteC).lerp(grabbing ? grabC : accentC, grabbing ? 0 : c.hov * .7);
      c.rayMat.opacity = .75 + .25 * c.hov;
    }
    hHover = hHover || !!P.grab;
    if (hover !== P.hover || hHover !== P.handleHover) { P.hover = hover; P.handleHover = hHover; MR.dirty = true; }
    const playing = VID.el && !VID.el.paused;
    const anim = P.need || (P.ripple && now - P.ripple.t < 480), gapMs = anim ? 25 : P.slow ? 50 : 60;
    if ((MR.dirty || anim || P.slow || (HM.stream && time - P.lastDraw > 250) || (playing && time - P.lastDraw > 500)) && time - P.lastDraw > gapMs) {
      drawPanel(P); tex.needsUpdate = true; drawBar(P); bTex.needsUpdate = true; MR.dirty = false; P.lastDraw = time;
    }
    const vr = P.vidRect; vMesh.visible = !!vr;
    if (vr) { vMesh.position.set((vr.x + vr.w / 2) / PW * PANEL_W - PANEL_W / 2, PANEL_H / 2 - (vr.y + vr.h / 2) / PH * PANEL_H, 0.002); vMesh.scale.set(vr.w / PW * PANEL_W, vr.h / PH * PANEL_H, 1); vMat.opacity = ek * eOut((now - P.sigAt) / 340); }
  };
  return P;
}
function panelAction(act, ctl) {
  try { const gp = ctl && ctl.userData.src && ctl.userData.src.gamepad; gp && gp.hapticActuators && gp.hapticActuators[0] && gp.hapticActuators[0].pulse(.4, 40); } catch (e) {}
  const P = MR.panel;
  if (act.startsWith('act:noop')) return;
  if (act.startsWith('act:hint:')) Q.useHint(act.slice(9));
  else if (act.startsWith('act:')) doAct(act.slice(4));
  else if (act === 'lang') Q.setLang(zh() ? 'en' : 'zh');
  else if (act === 'follow') { P.follow = !P.follow; }
  else if (act === 'side') { P.side *= -1; P.rel.yaw = -P.rel.yaw || P.side * .46; P.moving = true; }
  else if (act === 'reset') P.resetRel();
  else if (act === 'vid:open') { P.vidOpen = true; vidSync(Q.moduleOf(Q.R.i)); vidPlay(vidEl()); }
  else if (act === 'vid:close') { P.vidOpen = false; if (VID.el) VID.el.pause(); }
  else if (act === 'vid:toggle') vidToggle();
  else if (act === 'vid:restart') vidRestart();
  else if (act === 'vid:next') vidNext();
  else if (act === 'exit') stopAR();
  MR.dirty = true;
}
window.__panelAction = panelAction;

/* ---------- buttons ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.id === 'prepCam') prepCamera();
  else if (b.id === 'prepEnter') prepEnter();
  else if (b.dataset.reset) launcherReset(b.dataset.reset);
  else if (b.id === 'lzh' || b.id === 'len') setTimeout(renderLauncher, 0);
});
window.__mrx = { AR, HM, MR, SCAN, VID, scanState, drawPanel, drawScan, drawBar, panelAction, startWebXR, renderLauncher, setLastRes(r) { lastRes = r; if (r) r.t = performance.now(); } };   // setLastRes: for still renders / tests
renderLauncher();
})();
