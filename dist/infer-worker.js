/* QC 屏幕识别 Worker
 * 检测（screen_detector_416，朋友训练的 YOLO11n）→ 原框裁切 → 清晰度 → 13 类界面分类（screen_cls_v2）
 * 消息：
 *   {type:'init', base, models:'js'|'onnx'}         → 'cls-ready'、'det-ready'（分开回报：模拟设备不必等检测模型）
 *   {type:'frame', id, w, h, data, mode:'full'|'screen'}
 *      full   = 整帧：检测找屏幕再分类
 *      screen = 整张图就是屏幕（模拟设备）：直接分类
 *   → {type:'res', id, box, det, probs, read, ms}
 */
'use strict';
const DET = 416, CLS = 256, RW = 192, RH = 256, DET_CONF = 0.25;
let ortReady = null, det = null, cls = null;

function b64ToBytes(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

async function loadModel(base, kind, mode) {
  const name = kind === 'det' ? 'det416' : 'cls_v2', v = kind === 'det' ? 'QC_MODEL_DET' : 'QC_MODEL_CLS';
  let bytes;
  if (mode === 'onnx') {
    const r = await fetch(base + 'models/' + name + '.onnx'); if (!r.ok) throw new Error(name + ' HTTP ' + r.status);
    bytes = new Uint8Array(await r.arrayBuffer());
  } else { importScripts(base + 'models/' + name + '.js'); bytes = b64ToBytes(self[v]); self[v] = null; }
  const s = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  const S = kind === 'det' ? DET : CLS, t0 = performance.now();
  await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', new Float32Array(3 * S * S), [1, 3, S, S]) });
  return { s, inName: s.inputNames[0], outName: s.outputNames[0], warm: Math.round(performance.now() - t0) };
}

/* 把源图 (sx,sy,sw,sh) 区域重采样到目标 (dx,dy,dw,dh)：放大用双线性，缩小用多点平均（近似面积平均） */
function resampleInto(dst, DW, src, SW, SH, sx, sy, sw, sh, dx, dy, dw, dh) {
  const fx = sw / dw, fy = sh / dh, nx = Math.min(4, Math.max(1, Math.ceil(fx))), ny = Math.min(4, Math.max(1, Math.ceil(fy)));
  const inv = 1 / (nx * ny);
  for (let oy = 0; oy < dh; oy++) {
    for (let ox = 0; ox < dw; ox++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < ny; j++) {
        const yy = Math.min(SH - 1, Math.max(0, sy + (oy + (j + .5) / ny) * fy - .5));
        const y0 = yy | 0, y1 = Math.min(SH - 1, y0 + 1), wy = yy - y0;
        for (let i = 0; i < nx; i++) {
          const xx = Math.min(SW - 1, Math.max(0, sx + (ox + (i + .5) / nx) * fx - .5));
          const x0 = xx | 0, x1 = Math.min(SW - 1, x0 + 1), wx = xx - x0;
          const p00 = (y0 * SW + x0) * 4, p01 = (y0 * SW + x1) * 4, p10 = (y1 * SW + x0) * 4, p11 = (y1 * SW + x1) * 4;
          const a = (1 - wx) * (1 - wy), bb = wx * (1 - wy), c = (1 - wx) * wy, d = wx * wy;
          r += src[p00] * a + src[p01] * bb + src[p10] * c + src[p11] * d;
          g += src[p00 + 1] * a + src[p01 + 1] * bb + src[p10 + 1] * c + src[p11 + 1] * d;
          b += src[p00 + 2] * a + src[p01 + 2] * bb + src[p10 + 2] * c + src[p11 + 2] * d;
        }
      }
      const q = ((dy + oy) * DW + dx + ox) * 4;
      dst[q] = r * inv; dst[q + 1] = g * inv; dst[q + 2] = b * inv; dst[q + 3] = 255;
    }
  }
}
function toTensor(rgba, S) {
  const n = S * S, x = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { x[i] = rgba[4 * i] / 255; x[i + n] = rgba[4 * i + 1] / 255; x[i + 2 * n] = rgba[4 * i + 2] / 255; }
  return x;
}
/* 清晰度：灰度 → 3×3 高斯 → 拉普拉斯 → |值|>12 的像素占比（与 Python readability.py 一致） */
function readability(rgba, w, h) {
  const y = new Float32Array(w * h), b = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) y[i] = 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    let s = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ry = Math.min(h - 1, Math.max(0, yy + dy)) * w;
      for (let dx = -1; dx <= 1; dx++) s += y[ry + Math.min(w - 1, Math.max(0, xx + dx))] * (dx ? 1 : 2) * (dy ? 1 : 2);
    }
    b[yy * w + xx] = s / 16;
  }
  let cnt = 0, tot = 0;
  for (let yy = 1; yy < h - 1; yy++) for (let xx = 1; xx < w - 1; xx++) {
    const i = yy * w + xx, lap = b[i - 1] + b[i + 1] + b[i - w] + b[i + w] - 4 * b[i];
    if (Math.abs(lap) > 12) cnt++; tot++;
  }
  return cnt / tot;
}

async function classify(src, W, H, x, y, w, h) {
  const cr = new Uint8ClampedArray(CLS * CLS * 4); resampleInto(cr, CLS, src, W, H, x, y, w, h, 0, 0, CLS, CLS);
  const rd = new Uint8ClampedArray(RW * RH * 4); resampleInto(rd, RW, src, W, H, x, y, w, h, 0, 0, RW, RH);
  const read = readability(rd, RW, RH);
  const t0 = performance.now();
  const out = await cls.s.run({ [cls.inName]: new ort.Tensor('float32', toTensor(cr, CLS), [1, 3, CLS, CLS]) });
  return { probs: Array.from(out[cls.outName].data), read, ms: performance.now() - t0 };
}

async function detect(src, W, H) {
  const r = Math.min(DET / W, DET / H), nw = Math.round(W * r), nh = Math.round(H * r), px = (DET - nw) >> 1, py = (DET - nh) >> 1;
  const lb = new Uint8ClampedArray(DET * DET * 4); lb.fill(114);
  resampleInto(lb, DET, src, W, H, 0, 0, W, H, px, py, nw, nh);
  const t0 = performance.now();
  const out = (await det.s.run({ [det.inName]: new ort.Tensor('float32', toTensor(lb, DET), [1, 3, DET, DET]) }))[det.outName];
  const N = out.dims[2], d = out.data;
  let bi = -1, bs = DET_CONF, n = 0;
  for (let i = 0; i < N; i++) { const s = d[4 * N + i]; if (s >= DET_CONF) n++; if (s > bs) { bs = s; bi = i; } }
  const ms = performance.now() - t0;
  if (bi < 0) return { box: null, ms, n: 0 };
  const cx = d[bi], cy = d[N + bi], bw = d[2 * N + bi], bh = d[3 * N + bi];
  const x1 = Math.max(0, (cx - bw / 2 - px) / r), y1 = Math.max(0, (cy - bh / 2 - py) / r);
  const x2 = Math.min(W, (cx + bw / 2 - px) / r), y2 = Math.min(H, (cy + bh / 2 - py) / r);
  return { box: { x: x1, y: y1, w: x2 - x1, h: y2 - y1, s: bs }, ms, n };
}

onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      importScripts(m.base + 'ort/ort.wasm.min.js');
      ort.env.wasm.numThreads = 1; ort.env.wasm.wasmPaths = m.base + 'ort/';
      cls = await loadModel(m.base, 'cls', m.models); postMessage({ type: 'cls-ready', warm: cls.warm });
      det = await loadModel(m.base, 'det', m.models); postMessage({ type: 'det-ready', warm: det.warm });
    } catch (err) { postMessage({ type: 'error', msg: String((err && err.message) || err) }); }
    return;
  }
  if (m.type !== 'frame') return;
  const src = new Uint8ClampedArray(m.data), W = m.w, H = m.h;
  try {
    if (m.mode === 'screen') {
      if (!cls) return postMessage({ type: 'res', id: m.id, skipped: 'cls-loading' });
      const c = await classify(src, W, H, 0, 0, W, H);
      return postMessage({ type: 'res', id: m.id, box: { x: 0, y: 0, w: W, h: H, s: 1 }, det: null, probs: c.probs, read: c.read, ms: { cls: Math.round(c.ms) }, w: W, h: H });
    }
    if (!det || !cls) return postMessage({ type: 'res', id: m.id, skipped: 'det-loading' });
    const d = await detect(src, W, H);
    if (!d.box || d.box.w < 8 || d.box.h < 8) return postMessage({ type: 'res', id: m.id, box: null, ms: { det: Math.round(d.ms) }, w: W, h: H });
    const c = await classify(src, W, H, d.box.x, d.box.y, d.box.w, d.box.h);
    postMessage({ type: 'res', id: m.id, box: d.box, det: d.box.s, probs: c.probs, read: c.read, ms: { det: Math.round(d.ms), cls: Math.round(c.ms) }, w: W, h: H });
  } catch (err) { postMessage({ type: 'res', id: m.id, error: String((err && err.message) || err) }); }
};
