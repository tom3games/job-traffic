// 1日だけ職場体験 #2 交通誘導 — 片側通行の工事現場で旗1本、止める/流す。Three.js + Kenney Mini Characters (CC0)
import * as THREE from 'three'
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js'
import { clone as skClone } from './vendor/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js'
import { setupLook, enableShadows, surfaceTex, createFx, look, addBlobShadow, tidyTexts } from './look.js'
import { drawPayslip, totals } from './payslip.js'

const D = window.JT_DATA
const $ = s => document.querySelector(s)
const STEP = 1 / 60
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, k) => a + (b - a) * k
const sstep = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k) }
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0)
function mulberry(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const store = { get(k) { try { return localStorage.getItem('jt.' + k) } catch (e) { return null } }, set(k, v) { try { localStorage.setItem('jt.' + k, v) } catch (e) {} } }

// ---------- 道の寸法（道は z 方向。手前 +z がプレイヤー側）
const XA = -1.7, XB = 1.7, RW = 3.4
const SA = -5.6          // こちら側の停止線（車の先頭の z）
const SB = -28.6         // 向こう側の停止線（車の先頭の z）
const SH0 = -3.6, SH1 = -8.2, SH2 = -19.2, SH3 = -23.8   // 右車線へ寄る区間（車の中心の z）
const SPAWN_A = 46, SPAWN_B = -92, END_A = -95, END_B = 50
const GUARD = [-2.95, -6.7], PARTNER = [3.05, -29.8]
const SHIFT = D.SHIFT, HOUR = SHIFT.sec / (SHIFT.h1 - SHIFT.h0)

const S = {
  mode: 'title', lang: store.get('lang') || ((navigator.language || 'ja').startsWith('ja') ? 'ja' : 'en'),
  rand: Math.random, time: 0, flag: 'stop', flagT: 0, cars: [], cones: [], fxList: [],
  crash: 0, bike: 0, honk: 0, granny: 0, cone: 0, passed: 0, candy: 0, lastCrashT: -99, lastBikeT: -99,
  tut: 0, dbgPause: false, noSpawn: false, outT: 0, endT: 0, photo: null, photoPri: 0,
}
const TT = () => D.T[S.lang]
const pick = a => a[Math.floor(S.rand() * a.length) % a.length]

// ---------- 音（録音素材だけ。合成音は使わない。エンジンは sfx.js、出所は CREDITS.md）
const sf = (pre, n) => Array.from({ length: n }, (_, i) => `snd/${pre}${i + 1}.mp3`)
Snd.muted = store.get('mute') === '1'
Snd.def({
  tap: 'snd/tap.mp3', whistle: 'snd/whistle.mp3', whistleL: 'snd/whistleL.mp3', flag: sf('flag', 3), honk: sf('honk', 2), bighonk: sf('honk', 2), screech: sf('screech', 2), crash: sf('crash', 2), bell: 'snd/bell.mp3', radio: 'snd/radio.mp3', candy: 'snd/candy.mp3', scrape: 'snd/scrape.mp3', cone: 'snd/cone.mp3', grump: sf('grunt', 3), stamp: 'snd/stamp.mp3', chime: 'snd/chime.mp3', boo: 'snd/boo.mp3',
})
const SND_TRACKS = { title: ['snd/bgm_title.mp3', 0.2], play: ['snd/bgm_play.mp3', 0.16], end: ['snd/bgm_title.mp3', 0.2] }
Object.assign(Snd, {
  want: null, slow: 0, _init: Snd.init, _setMute: Snd.setMute,
  init() { const first = !this.ctx; this._init(); if (first && this.ctx) { this.loop('amb', 'snd/amb_site.mp3', 0.16, 1); this.loop('amb2', 'snd/amb_street.mp3', 0.14, 1); this.applyTrack() } },
  setMute(m) { this._setMute(m); store.set('mute', m ? '1' : '0') },
  setTrack(name) { if (this.want === name) return; this.want = name; this.applyTrack() },
  applyTrack() {
    if (!this.ctx) return
    const t = this.want && SND_TRACKS[this.want]; this.loop('bgm', t ? t[0] : null, t ? t[1] : 0, 0.3)
    if (t) this.played['bgm:' + this.want] = (this.played['bgm:' + this.want] || 0) + 1
  },
  // スロー中は曲もゆっくり
  tick() { const l = this.loops.bgm; if (l && l.node) l.node.playbackRate.value = 1 - this.slow * 0.45 },
  sfx(n, v = 1) {
    if (n === 'whistle') { this.play(n, { vol: 0.55, jitter: 0.02 }); return this.play(n, { vol: 0.55, jitter: 0.02, delay: 0.16 }) }
    if (n === 'whistleL') return this.play(n, { vol: 0.6, jitter: 0.02 })
    if (n === 'honk') return this.play(n, { vol: 0.32, rate: v > 0.9 ? 1 : 0.92 * v })
    if (n === 'bighonk') return this.play(n, { vol: 0.5, rate: 0.55 })
    if (n === 'screech') return this.play(n, { vol: 0.85, rate: 1.7 })
    if (n === 'crash') { this.duck(0.3, 1.4); return this.play(n, { vol: 1, rate: 0.75, room: 0.4 }) }
    if (n === 'grump') return this.play(n, { vol: 0.5, rate: 0.85 })
    if (n === 'bell') return this.play(n, { vol: 0.5, rate: 1.2 })
    if (n === 'boss') return this.play('grump', { vol: 0.9, rate: 0.62, room: 0.3 })
    return this.play(n, { vol: { tap: 0.45, flag: 0.5, radio: 0.6, cone: 0.55, candy: 0.7 }[n] ?? 0.9 })
  },
})

// ---------- 描画の土台
const canvas = $('#gl')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.75 : 2))
const scene = new THREE.Scene()
const SKY = { m: new THREE.Color(0xcfe8ff), n: new THREE.Color(0xb6dcff), e: new THREE.Color(0xf6b98a) }
scene.background = SKY.m.clone()
scene.fog = new THREE.Fog(scene.background.clone(), 60, 140)
const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 260)
const lk = setupLook(renderer, scene, { env: true, envIntensity: 0.45, exposure: 1.05, sun: 2.4, sunPos: [-6, 10, 7], hemi: 0.75, sky: 0xeaf4ff, ground: 0x6a6258 })
enableShadows(renderer, lk.sun, { center: [0, 0, -12], radius: 24, mapSize: isTouch ? 1024 : 2048, bias: -0.0006 })
const fx = createFx(scene, camera, renderer)
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, ...o })
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = scene) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }
const FONT = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Hiragino Sans",sans-serif'

// ---------- 街と道
const world = new THREE.Group(); scene.add(world)
function buildWorld() {
  // 地面
  const gTex = surfaceTex({ base: '#8a9a6a', noise: 0.1, grime: 0.12, repeat: [30, 30], seed: 3 })
  const ground = mesh(new THREE.PlaneGeometry(260, 260), std(0xffffff, { map: gTex, roughness: 0.95 }), 0, -0.02, -20, world); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true
  // 道（アスファルト）
  const aTex = surfaceTex({ w: 256, h: 256, base: '#56595e', noise: 0.16, grime: 0.18, repeat: [2, 50], seed: 9, draw: (x, w, h, r) => { for (let i = 0; i < 260; i++) { x.fillStyle = r() < 0.5 ? 'rgba(20,20,22,.35)' : 'rgba(200,200,200,.18)'; x.fillRect(r() * w, r() * h, 2, 2) } } })
  const road = mesh(new THREE.PlaneGeometry(RW * 2, 220), std(0xffffff, { map: aTex, roughness: 0.92 }), 0, 0, -20, world); road.rotation.x = -Math.PI / 2; road.receiveShadow = true
  const white = std(0xf4f2ea, { roughness: 0.8 })
  const line = (w, l, x, z) => { const m = mesh(new THREE.PlaneGeometry(w, l), white, x, 0.012, z, world); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; return m }
  line(0.15, 220, -RW + 0.25, -20); line(0.15, 220, RW - 0.25, -20)
  for (let z = 60; z > -120; z -= 6) if (z > -3 || z < -26) line(0.14, 3, 0, z)
  // 歩道と縁石
  const swTex = surfaceTex({ base: '#b9b4aa', noise: 0.08, grime: 0.1, repeat: [2, 60], seed: 4, draw: (x, w, h) => { x.strokeStyle = 'rgba(60,55,50,.35)'; x.lineWidth = 2; for (let y = 0; y < h; y += 64) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke() } } })
  for (const s of [-1, 1]) {
    const sw = mesh(new THREE.BoxGeometry(2.6, 0.18, 220), std(0xffffff, { map: swTex, roughness: 0.9 }), s * (RW + 1.3), 0.09, -20, world); sw.receiveShadow = true; sw.castShadow = false
    mesh(new THREE.BoxGeometry(0.18, 0.22, 220), std(0xd8d4cc), s * (RW + 0.09), 0.11, -20, world).receiveShadow = true
  }
  // 家並み
  const r = mulberry(11)
  const roofCols = [0x3a4a6a, 0x5a3a2a, 0x2f4f4f, 0x6a5040, 0x404850], wallCols = [0xf0e6d6, 0xe6ddd0, 0xd9d2c4, 0xf5efe6, 0xcfc6b8, 0xe8d8c0]
  const winTex = canvasTex(128, 128, (x) => { x.fillStyle = '#e9e4da'; x.fillRect(0, 0, 128, 128); for (const [px, py] of [[16, 20], [72, 20], [16, 74], [72, 74]]) { x.fillStyle = '#4a5a6a'; x.fillRect(px, py, 40, 38); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(px + 3, py + 3, 14, 32); x.strokeStyle = '#8a8070'; x.lineWidth = 3; x.strokeRect(px, py, 40, 38) } })
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping
  for (const s of [-1, 1]) {
    let z = 40
    while (z > -120) {
      const near = s > 0, w = 6 + r() * 4, d = 6 + r() * 3, h = near ? 2.6 + r() * 0.6 : 4.5 + r() * 3.5, x = s * (RW + 2.6 + 1.6 + d / 2 + r() * 1.2 + (near ? 5.5 : 0))
      const wc = wallCols[Math.floor(r() * wallCols.length)]
      const wm = std(wc, { roughness: 0.85 }), wt = winTex.clone(); wt.needsUpdate = true; wt.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)))
      // 窓は道側の面に（BoxGeometry の面順 +x,-x,+y,-y,+z,-z）
      const wn = std(0xffffff, { map: wt, roughness: 0.8, color: wc })
      const body = new THREE.Mesh(new THREE.BoxGeometry(d, h, w), [wn, wn, wm, wm, wm, wm])
      body.position.set(x, h / 2, z - w / 2); world.add(body); body.castShadow = true; body.receiveShadow = true
      // 屋根（切妻）
      const rs = new THREE.Shape(); rs.moveTo(-d / 2 - 0.4, 0); rs.lineTo(d / 2 + 0.4, 0); rs.lineTo(0, near ? 1.0 : 1.6 + r() * 0.8); rs.closePath()
      const rg = new THREE.ExtrudeGeometry(rs, { depth: w + 0.6, bevelEnabled: false }); rg.translate(0, 0, -(w + 0.6) / 2)
      const roof = mesh(rg, std(roofCols[Math.floor(r() * roofCols.length)], { roughness: 0.6 }), x, h, z - w / 2, world); roof.castShadow = true
      // ブロック塀
      if (r() < 0.6) { const wall = mesh(new THREE.BoxGeometry(0.2, 1.1, w * 0.8), std(0xb0aaa0, { roughness: 0.95 }), s * (RW + 2.75), 0.55, z - w / 2, world); wall.castShadow = true; wall.receiveShadow = true }
      z -= w + 1 + r() * 2.5
    }
  }
  // 電柱と電線
  const poleM = std(0x9a958c, { roughness: 0.9 }), wireM = new THREE.LineBasicMaterial({ color: 0x222222 })
  const tops = []
  for (let z = 30; z > -110; z -= 13) {
    const p = mesh(new THREE.CylinderGeometry(0.13, 0.17, 8.5, 8), poleM, -(RW + 2.2), 4.25, z, world); p.castShadow = true
    mesh(new THREE.BoxGeometry(1.6, 0.1, 0.1), poleM, -(RW + 2.2), 7.6, z, world)
    tops.push(new THREE.Vector3(-(RW + 2.9), 7.65, z), new THREE.Vector3(-(RW + 1.5), 7.65, z))
  }
  for (const off of [0, 1]) { const pts = []; for (let i = off; i < tops.length; i += 2) pts.push(tops[i]); const lg = new THREE.BufferGeometry().setFromPoints(pts); world.add(new THREE.Line(lg, wireM)) }
  // 木
  const leaf = std(0x5f8f4a, { roughness: 0.9 }), trunk = std(0x6a4a30)
  for (let i = 0; i < 10; i++) { const z = 25 - i * 14 - r() * 4 - 6, x = -(RW + 1.9); const t = mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.6, 6), trunk, x, 0.98, z, world); t.castShadow = true; const l = mesh(new THREE.IcosahedronGeometry(1.0 + r() * 0.3, 1), leaf, x, 2.3, z, world); l.castShadow = true; l.scale.y = 1.15 }
  buildWorkZone()
}

// ---------- 工事区間
const ZONE = new THREE.Group(); scene.add(ZONE)
let arrowMat, excavator
function makeCone() {
  const g = new THREE.Group()
  const red = std(0xe2462b, { roughness: 0.5 }), wht = std(0xf5f5f0, { roughness: 0.5 })
  const base = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), red, 0, 0.03, 0, g)
  const body = mesh(new THREE.CylinderGeometry(0.05, 0.2, 0.72, 12), red, 0, 0.42, 0, g)
  const band = mesh(new THREE.CylinderGeometry(0.105, 0.145, 0.16, 12), wht, 0, 0.5, 0, g)
  for (const m of [base, body, band]) m.castShadow = true
  return g
}
function stripeTex(a, b, n = 8) { return canvasTex(256, 32, (x, w, h) => { x.fillStyle = a; x.fillRect(0, 0, w, h); x.fillStyle = b; for (let i = -1; i < n * 2; i++) { x.beginPath(); x.moveTo(i * w / n, h); x.lineTo(i * w / n + h, 0); x.lineTo(i * w / n + h + w / n / 2, 0); x.lineTo(i * w / n + w / n / 2, h); x.fill() } }) }
function buildWorkZone() {
  // 掘った跡・敷鉄板
  const dirt = mesh(new THREE.PlaneGeometry(2.6, 9), std(0x6b4a32, { roughness: 1 }), -1.7, 0.015, -14, ZONE); dirt.rotation.x = -Math.PI / 2; dirt.receiveShadow = true
  const plateTex = surfaceTex({ base: '#6f7378', noise: 0.12, grime: 0.2, seed: 5, draw: (x, w, h) => { x.strokeStyle = 'rgba(30,30,30,.4)'; x.lineWidth = 2; for (let i = 0; i < w; i += 12) for (let j = 0; j < h; j += 12) { x.beginPath(); x.moveTo(i, j); x.lineTo(i + 6, j + 6); x.stroke() } } })
  for (const z of [-10.3, -12.0]) { const p = mesh(new THREE.BoxGeometry(2.4, 0.05, 1.6), std(0xffffff, { map: plateTex, metalness: 0.4, roughness: 0.6 }), -1.75, 0.03, z, ZONE); p.receiveShadow = true }
  const pile = mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x7a5636, { roughness: 1 }), -2.4, 0, -16.6, ZONE); pile.scale.set(1.1, 0.55, 1.5); pile.castShadow = true; pile.receiveShadow = true
  // コーン（入口と出口は斜め、中は真っすぐ）
  const pts = []
  for (let k = 0; k <= 3; k++) pts.push([-3.1 + k * 0.97, -7.4 - k * 0.75])
  for (let z = -10.0; z > -18.6; z -= 1.45) pts.push([-0.2, z])
  for (let k = 0; k <= 3; k++) pts.push([-0.2 - k * 0.97, -19.4 - k * 0.75])
  const bar = stripeTex('#ffd21a', '#1d1a16', 6)
  let prev = null
  for (const [x, z] of pts) {
    const c = makeCone(); c.position.set(x, 0, z); ZONE.add(c)
    S.cones.push({ g: c, x, z, down: 0, dir: 1, broken: false })
    if (prev) { const dx = x - prev[0], dz = z - prev[1], len = Math.hypot(dx, dz); const b = mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), std(0xffffff, { map: bar }), (x + prev[0]) / 2, 0.78, (z + prev[1]) / 2, ZONE); b.rotation.z = Math.PI / 2; b.rotation.y = -Math.atan2(dz, dx); b.userData.bar = true; S.cones[S.cones.length - 1].bar = b }
    prev = [x, z]
  }
  // A型バリケード
  const bTex = stripeTex('#ffffff', '#e2462b', 5)
  for (const z of [-9.2, -20.4]) {
    const g = new THREE.Group(); g.position.set(-1.75, 0, z); ZONE.add(g)
    for (const y of [0.55, 0.95]) { const b = mesh(new THREE.BoxGeometry(2.2, 0.22, 0.04), std(0xffffff, { map: bTex, roughness: 0.5 }), 0, y, 0, g); b.castShadow = true }
    for (const x of [-1.0, 1.0]) for (const s of [-1, 1]) { const l = mesh(new THREE.BoxGeometry(0.06, 1.15, 0.06), std(0xdddddd), x, 0.55, s * 0.18, g); l.rotation.x = s * 0.25 }
  }
  // 矢印板（点滅）
  const arrowCan = document.createElement('canvas'); arrowCan.width = 128; arrowCan.height = 128
  const arrowTex = new THREE.CanvasTexture(arrowCan); arrowTex.colorSpace = THREE.SRGBColorSpace
  const ax = arrowCan.getContext('2d'); ax.fillStyle = '#111'; ax.fillRect(0, 0, 128, 128); ax.fillStyle = '#ffcc22'
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { const u = i - 4, v = j - 4; const on = (v === 0 && u >= -3 && u <= 2) || (Math.abs(v) === 3 - u && u >= 0 && u <= 3); if (on) { ax.beginPath(); ax.arc(14 + i * 12.5, 14 + j * 12.5, 4.5, 0, 7); ax.fill() } }
  arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, toneMapped: false })
  const ab = new THREE.Group(); ab.position.set(-1.9, 0, -8.6); ZONE.add(ab)
  mesh(new THREE.PlaneGeometry(1.3, 1.3), arrowMat, 0, 1.55, 0.03, ab)
  const frame = mesh(new THREE.BoxGeometry(1.45, 1.45, 0.06), std(0x2a2a2a), 0, 1.55, 0, ab); frame.castShadow = true
  for (const x of [-0.5, 0.5]) mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), std(0x888888), x, 0.45, -0.05, ab)
  // 看板（ご迷惑をおかけします）
  const sign = new THREE.Group(); sign.position.set(-(RW + 1.0), 0.18, -2.2); sign.rotation.y = 0.35; scene.add(sign)
  const sTex = canvasTex(256, 360, (x, w, h) => {
    x.fillStyle = '#ffd21a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#1d1a16'; x.lineWidth = 10; x.strokeRect(5, 5, w - 10, h - 10)
    x.fillStyle = '#1d1a16'; x.textAlign = 'center'; x.font = `900 42px ${FONT}`; x.fillText(S.lang === 'ja' ? '工事中' : 'WORK', w / 2, 64)
    // おじぎする人
    x.save(); x.translate(w / 2 - 10, 190); x.fillStyle = '#1d1a16'
    x.beginPath(); x.arc(46, -34, 17, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(46, -40, 17, Math.PI, 0); x.fill(); x.fillStyle = '#1d1a16'
    x.lineWidth = 16; x.lineCap = 'round'; x.strokeStyle = '#1d1a16'; x.beginPath(); x.moveTo(30, -22); x.lineTo(-10, 10); x.lineTo(-10, 70); x.stroke(); x.beginPath(); x.moveTo(20, -14); x.lineTo(28, 30); x.stroke(); x.restore()
    x.font = `900 26px ${FONT}`; x.fillText(S.lang === 'ja' ? 'ご迷惑を' : 'Sorry for', w / 2, 300); x.fillText(S.lang === 'ja' ? 'おかけします' : 'the trouble', w / 2, 334)
  })
  mesh(new THREE.PlaneGeometry(0.9, 1.26), std(0xffffff, { map: sTex, roughness: 0.6 }), 0, 1.25, 0.02, sign)
  const sb = mesh(new THREE.BoxGeometry(0.98, 1.34, 0.04), std(0x333333), 0, 1.25, -0.01, sign); sb.castShadow = true
  for (const x of [-0.35, 0.35]) mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), std(0x888888), x, 0.35, -0.03, sign)
  // ミニショベル
  excavator = makeExcavator(); excavator.position.set(-1.6, 0, -14.5); excavator.rotation.y = 0.5; ZONE.add(excavator)
}
function makeExcavator() {
  const g = new THREE.Group(), yel = std(0xf2b51c, { roughness: 0.45 }), dk = std(0x2b2b2b, { roughness: 0.8 }), glass = std(0x223040, { roughness: 0.15, metalness: 0.2 })
  for (const x of [-0.55, 0.55]) { const tr = new THREE.Group(); g.add(tr); tr.position.x = x; mesh(new THREE.BoxGeometry(0.34, 0.36, 1.7), dk, 0, 0.2, 0, tr).castShadow = true; for (const z of [-0.85, 0.85]) { const w = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.34, 12), dk, 0, 0.2, z, tr); w.rotation.z = Math.PI / 2 } }
  const top = new THREE.Group(); top.position.y = 0.42; g.add(top); g.userData.top = top
  mesh(new THREE.BoxGeometry(1.3, 0.5, 1.4), yel, 0, 0.25, -0.1, top).castShadow = true
  const cab = mesh(new THREE.BoxGeometry(0.75, 0.9, 0.75), glass, 0.22, 0.95, 0.05, top); cab.castShadow = true
  mesh(new THREE.BoxGeometry(0.85, 0.08, 0.85), yel, 0.22, 1.43, 0.05, top)
  const boom = new THREE.Group(); boom.position.set(-0.3, 0.5, 0.6); top.add(boom); g.userData.boom = boom
  mesh(new THREE.BoxGeometry(0.22, 0.22, 1.5), yel, 0, 0.35, 0.65, boom).rotation.x = -0.5
  const arm = new THREE.Group(); arm.position.set(0, 0.72, 1.32); boom.add(arm); g.userData.arm = arm
  mesh(new THREE.BoxGeometry(0.18, 0.18, 1.1), yel, 0, -0.35, 0.3, arm).rotation.x = 0.9
  const bk = mesh(new THREE.BoxGeometry(0.45, 0.32, 0.3), dk, 0, -0.75, 0.62, arm); bk.castShadow = true
  return g
}

// ---------- キャラ（Kenney Mini Characters, CC0）
const MODELS = {}
let charsReady = false
const loader = new GLTFLoader()
const CHAR_FILES = ['male-c', 'male-b', 'female-c', 'female-a', 'female-b', 'female-d', 'female-f', 'male-a', 'male-d', 'male-e', 'male-f']
const DRIVERS = ['female-a', 'female-b', 'female-d', 'female-f', 'male-a', 'male-d', 'male-e', 'male-f', 'male-b']
function loadChars() { return Promise.all(CHAR_FILES.map(n => new Promise(res => loader.load(`chars/character-${n}.glb`, g => { MODELS[n] = g; res() }, undefined, () => res())))).then(() => { charsReady = true }) }
function makeChar(name, H = 1.7, anim = 'idle') {
  const src = MODELS[name]; if (!src) return null
  const root = skClone(src.scene), g = new THREE.Group(); g.add(root)
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.roughness = 0.75 } })
  const box = new THREE.Box3().setFromObject(root), hgt = box.max.y - box.min.y
  g.scale.setScalar(H / hgt)
  const mixer = new THREE.AnimationMixer(root), acts = {}
  for (const c of src.animations) acts[c.name] = mixer.clipAction(c)
  const c = { g, root, mixer, acts, cur: null, name, head: root.getObjectByName('head'), armR: root.getObjectByName('arm-right'), armL: root.getObjectByName('arm-left'), torso: root.getObjectByName('torso') }
  play(c, anim)
  return c
}
function play(c, name, fade = 0.2, speed = 1) {
  if (!c) return; const a = c.acts[name]; if (!a) return
  a.timeScale = speed
  if (c.cur === name) return
  const prev = c.cur ? c.acts[c.cur] : null
  a.reset().play(); if (prev) a.crossFadeFrom(prev, fade, false)
  c.cur = name
}
// ---------- 顔（Kenney の顔は固定なので、目と口の面を肌色に塗り替えて頭の骨に顔の板を貼る）
const FACE_INK = '#2f2f37', _ft = {}
function faceTex(expr) {
  return _ft[expr] || (_ft[expr] = canvasTex(256, 256, (x) => {
    x.fillStyle = FACE_INK; x.strokeStyle = FACE_INK; x.lineCap = 'round'; x.lineJoin = 'round'
    const poly = (...p) => { x.beginPath(); x.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]); x.closePath(); x.fill() }
    const both = (f) => { f(); x.save(); x.translate(256, 0); x.scale(-1, 1); f(); x.restore() }
    const white = (cx, cy, rx, ry) => { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 7); x.fill(); x.fillStyle = FACE_INK }
    const sweat = (cx, cy, k = 1) => { x.save(); x.fillStyle = '#7cc8f5'; x.beginPath(); x.moveTo(cx, cy - 24 * k); x.quadraticCurveTo(cx + 20 * k, cy + 6 * k, cx, cy + 16 * k); x.quadraticCurveTo(cx - 20 * k, cy + 6 * k, cx, cy - 24 * k); x.fill(); x.restore() }
    switch (expr) {
      case 'calm': both(() => { x.beginPath(); x.ellipse(82, 100, 16, 22, 0, 0, 7); x.fill() }); x.lineWidth = 12; x.beginPath(); x.moveTo(100, 172); x.lineTo(156, 172); x.stroke(); break
      case 'blink': x.lineWidth = 12; both(() => { x.beginPath(); x.moveTo(64, 102); x.lineTo(100, 102); x.stroke() }); x.beginPath(); x.moveTo(100, 172); x.lineTo(156, 172); x.stroke(); break
      case 'happy': x.lineWidth = 14; both(() => { x.beginPath(); x.moveTo(58, 110); x.quadraticCurveTo(82, 72, 106, 110); x.stroke() }); poly(88, 156, 168, 156, 150, 204, 106, 204); x.fillStyle = '#d9534f'; x.beginPath(); x.ellipse(128, 192, 16, 9, 0, 0, 7); x.fill(); break
      case 'sweat': both(() => { x.beginPath(); x.ellipse(84, 104, 18, 13, 0, 0, 7); x.fill(); x.lineWidth = 10; x.beginPath(); x.moveTo(56, 62); x.lineTo(108, 76); x.stroke() }); x.lineWidth = 11; x.beginPath(); x.moveTo(96, 182); for (let i = 1; i <= 4; i++) x.lineTo(96 + i * 16, 182 + (i % 2 ? -12 : 0)); x.stroke(); sweat(214, 74); sweat(36, 104, 0.8); break
      case 'shock': both(() => { white(82, 102, 30, 37); x.beginPath(); x.ellipse(82, 104, 8, 8, 0, 0, 7); x.fill(); x.lineWidth = 10; x.beginPath(); x.moveTo(50, 48); x.quadraticCurveTo(82, 30, 112, 50); x.stroke() }); x.beginPath(); x.ellipse(128, 190, 20, 30, 0, 0, 7); x.fill(); break
      case 'cry': x.lineWidth = 14; both(() => { x.beginPath(); x.moveTo(58, 96); x.quadraticCurveTo(82, 122, 106, 96); x.stroke() }); x.lineWidth = 12; x.beginPath(); x.moveTo(98, 196); x.quadraticCurveTo(128, 164, 158, 196); x.stroke(); x.fillStyle = '#7cc8f5'; x.fillRect(66, 112, 26, 92); x.fillRect(164, 112, 26, 92); break
      case 'annoyed': both(() => { poly(58, 92, 106, 92, 106, 118, 58, 118) }); x.lineWidth = 12; x.beginPath(); x.moveTo(102, 178); x.lineTo(154, 172); x.stroke(); break
      case 'angry': both(() => { poly(60, 100, 108, 114, 100, 132, 62, 126); x.lineWidth = 17; x.beginPath(); x.moveTo(48, 64); x.lineTo(114, 96); x.stroke() }); poly(84, 164, 172, 164, 180, 216, 76, 216); x.fillStyle = '#fff'; x.fillRect(92, 170, 72, 15); break
      case 'sleep': x.lineWidth = 12; both(() => { x.beginPath(); x.moveTo(58, 104); x.quadraticCurveTo(82, 118, 106, 104); x.stroke() }); x.beginPath(); x.ellipse(128, 184, 14, 12, 0, 0, 7); x.fill(); break
    }
  }))
}
function blankFace(name) {
  const model = MODELS[name]; if (model.userData.face !== undefined) return model.userData.face
  let hm = null; model.scene.traverse(o => { if (o.name === 'head-mesh') hm = o })
  model.userData.face = null; if (!hm) return null
  const g = hm.geometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index, img = hm.material.map.image
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); const d = cx.getImageData(0, 0, img.width, img.height).data
  // 目と口は全モデル同じ1色 (63,63,70)
  const dark = (i) => { const px = Math.min(img.width - 1, Math.floor(uv.getX(i) * img.width)), py = Math.min(img.height - 1, Math.floor(uv.getY(i) * img.height)), k = (py * img.width + px) * 4; return Math.abs(d[k] - 63) < 3 && Math.abs(d[k + 1] - 63) < 3 && Math.abs(d[k + 2] - 70) < 3 }
  const eyes = new Set(); let z0 = 0
  for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (dark(a) && dark(b) && dark(c) && Math.min(pos.getZ(a), pos.getZ(b), pos.getZ(c)) > 0.08) { eyes.add(a); eyes.add(b); eyes.add(c); z0 = Math.max(z0, pos.getZ(a)) } }
  if (!eyes.size) return null
  for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (Math.abs(pos.getZ(a) - z0) < 0.0015 && Math.abs(pos.getZ(b) - z0) < 0.0015 && Math.abs(pos.getZ(c) - z0) < 0.0015) { eyes.add(a); eyes.add(b); eyes.add(c) } }
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9
  for (const i of eyes) { x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i)); y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)) }
  const fy = (y0 + y1) / 2
  let skin = null, best = -9
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (eyes.has(a)) continue
    const ys = [pos.getY(a), pos.getY(b), pos.getY(c)], xs = [pos.getX(a), pos.getX(b), pos.getX(c)], z = Math.max(pos.getZ(a), pos.getZ(b), pos.getZ(c))
    if (Math.min(...ys) > fy || Math.max(...ys) < fy || Math.min(...xs) > 0 || Math.max(...xs) < 0 || z > z0 + 0.001 || z < best) continue
    best = z; skin = [uv.getX(a), uv.getY(a)]
  }
  if (skin) { for (const i of eyes) uv.setXY(i, skin[0], skin[1]); uv.needsUpdate = true }
  const skel = hm.skeleton, bi = skel ? skel.bones.findIndex(b => b.name === 'head') : -1
  model.userData.face = { p: new THREE.Vector3(0, fy, z0 + 0.004), w: 0.34, bind: bi >= 0 ? skel.boneInverses[bi].clone() : null }
  return model.userData.face
}
function addFace(c) {
  const fb = blankFace(c.name); if (!fb || !c.head) return
  const m = new THREE.Mesh(new THREE.PlaneGeometry(fb.w, fb.w), new THREE.MeshBasicMaterial({ map: faceTex('calm'), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }))
  if (fb.bind) m.position.copy(fb.p).applyMatrix4(fb.bind); else m.position.copy(fb.p)
  m.renderOrder = 2; c.head.add(m); c.face = m; c.expr = 'calm'
}
function setFace(c, expr) { if (!c || !c.face || c.expr === expr) return; c.expr = expr; c.face.material.map = faceTex(expr); if (c === G.c) drawBadge(expr) }
// 自分の顔は遊び中の画面で小さいので、胸の身分証の写真でも見せる
function drawBadge(expr) {
  const cv = $('#gBadge'); if (!cv) return
  const x = cv.getContext('2d'), W = cv.width, H = cv.height
  x.clearRect(0, 0, W, H)
  x.fillStyle = '#f6f2e6'; x.fillRect(0, 0, W, H)
  x.fillStyle = '#1f3a68'; x.fillRect(0, 0, W, 16)
  x.fillStyle = '#f0b98f'; x.fillRect(10, 26, W - 20, H - 36)            // 肌
  x.fillStyle = '#5a7fc2'; x.fillRect(8, 22, W - 16, 24); x.fillStyle = '#2b2f36'; x.fillRect(6, 44, W - 12, 7); x.fillStyle = '#e9c24a'; x.fillRect(W / 2 - 6, 26, 12, 12)   // 制帽
  x.drawImage(faceTex(expr).image, 8, 40, W - 16, W - 16)
}
// 自分の表情: 事故未遂 > 3回目が近い > クラクション・長い列 > 流せている > ふつう
function guardExpr(dt) {
  if (S.time - S.lastCrashT < 2.6) return 'shock'
  if (G.happyT > 0) { G.happyT -= dt; return 'happy' }
  if (S.mode === 'play' && S.crash >= 2) return 'cry'
  const longWait = S.cars.some(c => c.wait > WAIT_HONK * 0.7)
  if (S.mode === 'play' && (longWait || P.sleepT > 0)) return P.sleepT > 0 ? 'annoyed' : 'sweat'
  G.blinkT = (G.blinkT ?? 2) - dt; if (G.blinkT < 0) { if (G.blinkT < -0.12) G.blinkT = 2 + Math.random() * 3; return 'blink' }
  return 'calm'
}

// ---------- 現場監督（事故未遂で走ってきて怒る。3回目は連れて帰る。終業はねぎらいに来る）
const BOSS = { c: null, st: 'off', t: 0, x: -7.5, z: -16, stayT: 0, line: null, bub: null }
const BOSS_HOME = [-7.5, -16], BOSS_SPOT = [-4.55, -5.9]
function bossCome(line, o = {}) {
  if (!BOSS.c) return
  BOSS.line = line; BOSS.stayT = o.stay ?? 2.6; BOSS.mood = o.mood ?? 'angry'; BOSS.fast = o.fast ?? true
  if (BOSS.st === 'off') { BOSS.x = BOSS_HOME[0]; BOSS.z = BOSS_HOME[1] }
  BOSS.st = 'come'; BOSS.c.g.visible = true
}
function updateBoss(dt) {
  const c = BOSS.c; if (!c) return
  if (BOSS.st === 'off') return
  c.mixer.update(dt)
  const tgt = BOSS.st === 'back' ? BOSS_HOME : BOSS_SPOT, dx = tgt[0] - BOSS.x, dz = tgt[1] - BOSS.z, dist = Math.hypot(dx, dz)
  if (BOSS.st === 'come' || BOSS.st === 'back') {
    const sp = BOSS.st === 'come' ? (BOSS.fast ? 9 : 5) : 3.5
    if (dist > 0.1) { const s = Math.min(dist, sp * dt); BOSS.x += dx / dist * s; BOSS.z += dz / dist * s; c.g.rotation.y = Math.atan2(dx, dz); play(c, BOSS.st === 'come' && BOSS.fast ? 'sprint' : 'walk', 0.15, BOSS.st === 'come' && BOSS.fast ? 1.4 : 1.1) }
    else if (BOSS.st === 'come') { BOSS.st = 'stay'; BOSS.t = 0; const l = BOSS.line; if (l) { say(BOSS, l, 'boss', Math.max(2.0, 0.9 + l.length * 0.12)); Snd.sfx('boss') } }
    else { BOSS.st = 'off'; c.g.visible = false }
  } else if (BOSS.st === 'stay') {
    BOSS.t += dt
    c.g.rotation.y = lerpA(c.g.rotation.y, Math.atan2(GUARD[0] - BOSS.x, GUARD[1] - BOSS.z), Math.min(1, dt * 8))
    play(c, BOSS.mood === 'angry' ? 'emote-no' : 'emote-yes', 0.15, 1.4)
    if (BOSS.t > BOSS.stayT) { BOSS.st = 'back'; setFace(c, 'calm') }
  }
  setFace(c, BOSS.st === 'come' || BOSS.st === 'stay' ? (BOSS.mood === 'angry' ? 'angry' : 'happy') : 'calm')
  c.g.position.set(BOSS.x, 0, BOSS.z)
}
function lerpA(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k }

// ---------- 事故未遂のスロー（0.15倍から戻す。カメラは現場に寄る）
const SLOW = { sec: 1.5, peak: 0.55 }
function startSlow(pos) { S.slowT = SLOW.sec; S.slowPos = pos.clone(); S.slowShot = false }
function slowK() { if (!(S.slowT > 0)) return 1; const u = 1 - S.slowT / SLOW.sec; return u < 0.7 ? 0.15 : lerp(0.15, 1, (u - 0.7) / 0.3) }
function updateSlow() {
  if (!(S.slowT > 0)) { Snd.slow = 0; return }
  S.slowT -= STEP
  const u = clamp(1 - S.slowT / SLOW.sec, 0, 1); Snd.slow = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3
  if (!S.slowShot && SLOW.sec - S.slowT >= SLOW.peak) { S.slowShot = true; capturePhoto(S.slowPos, 3) }
}
// カメラの寄り（u: 0→寄る→0）
function applyShotCam() {
  if (!(S.slowT > 0) || !S.slowPos) { if (S.camShot) { S.camShot = false; frameCamera() } return }
  const u = clamp(1 - S.slowT / SLOW.sec, 0, 1), k = u < 0.2 ? sstep(u / 0.2) : u > 0.75 ? sstep((1 - u) / 0.25) : 1
  if (!S.camShot) { S.camShot = true; camBase.p.copy(camera.position); camBase.q.copy(camera.quaternion) }
  _cs.copy(S.slowPos); _cs.y = 1.0
  _cp.copy(_cs).add(_cd.set(1.8, 7.5, 9.5))
  camera.position.lerpVectors(camBase.p, _cp, k * 0.72)
  camera.quaternion.copy(camBase.q); _cm.lookAt(camera.position, _cs, camera.up); _cqq.setFromRotationMatrix(_cm); camera.quaternion.slerp(_cqq, k)
}
const camBase = { p: new THREE.Vector3(), q: new THREE.Quaternion() }, _cs = new THREE.Vector3(), _cp = new THREE.Vector3(), _cd = new THREE.Vector3(), _cm = new THREE.Matrix4(), _cqq = new THREE.Quaternion()
// ヘルメット
function addHelmet(c, color = 0xffffff, line = 0x2a9d6f) {
  if (!c || !c.head) return
  // 頭の実寸に合わせる（髪が突き抜けず、上から見ても大きく見える）
  let head = null; c.root.traverse(o => { if (o.name === 'head-mesh') head = o })
  const bb = new THREE.Box3()
  head.geometry.computeBoundingBox(); bb.copy(head.geometry.boundingBox)
  const bi = head.skeleton ? head.skeleton.bones.findIndex(b => b.name === 'head') : -1
  if (bi >= 0) bb.applyMatrix4(head.skeleton.boneInverses[bi])
  const sz = bb.getSize(new THREE.Vector3()), cn = bb.getCenter(new THREE.Vector3())
  const hm = new THREE.Group(), brimY = bb.max.y - sz.y * 0.4
  hm.position.set(cn.x, brimY, cn.z)
  const shell = mesh(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(color, { roughness: 0.35 }), 0, 0, 0, hm); shell.scale.set(sz.x * 0.62, sz.y * 0.62, sz.z * 0.62); shell.castShadow = true
  mesh(new THREE.CylinderGeometry(1, 1, sz.y * 0.05, 20), std(color, { roughness: 0.35 }), 0, 0, sz.z * 0.05, hm).scale.set(sz.x * 0.68, 1, sz.z * 0.7)
  const stripe = mesh(new THREE.SphereGeometry(1.012, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(line), 0, 0, 0, hm); stripe.scale.set(sz.x * 0.16, sz.y * 0.625, sz.z * 0.63)
  c.head.add(hm); return hm
}

// ---------- 警備員（自分）と相方
const flagMat = { red: std(0xe2361f, { roughness: 0.6, side: THREE.DoubleSide }), white: std(0xf7f7f2, { roughness: 0.6, side: THREE.DoubleSide }) }
function makeFlag() {
  const g = new THREE.Group()
  const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.25, 6), std(0x8a6a4a), 0, 0.62, 0, g); pole.castShadow = true
  const geo = new THREE.PlaneGeometry(0.62, 0.46, 10, 4); geo.translate(0.31, 0, 0)
  const cloth = mesh(geo, flagMat.red, 0.02, 1.0, 0, g); cloth.castShadow = true
  g.userData = { cloth, base: geo.attributes.position.array.slice() }
  return g
}
function waveFlag(f, t, amp) {
  const { cloth, base } = f.userData, p = cloth.geometry.attributes.position
  for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.array[i * 3 + 2] = Math.sin(x * 9 - t * 9) * 0.06 * amp * (x / 0.62) }
  p.needsUpdate = true; cloth.geometry.computeVertexNormals()
}
const G = { c: null, flag: makeFlag(), swing: 0, pose: 0, pointT: 0 }   // 自分
const P = { c: null, flag: makeFlag(), state: 'go', t: 0, handed: false, delay: 0, sleepT: 0, nextSleep: 0, fullT: 0 }   // 相方
scene.add(G.flag, P.flag); G.flag.scale.setScalar(1.5); P.flag.scale.setScalar(1.5)
G.flag.visible = P.flag.visible = false
let guardBlob, partnerBlob
function setupPeople() {
  G.c = makeChar('male-c', 2.25); G.c.g.position.set(GUARD[0], 0, GUARD[1]); G.c.g.rotation.y = 0.35; scene.add(G.c.g); guardBlob = addBlobShadow(G.c.g, 1.1, { opacity: 0.3 })
  P.c = makeChar('male-c', 2.25); P.c.g.position.set(PARTNER[0], 0, PARTNER[1]); P.c.g.rotation.y = Math.PI + 0.4; scene.add(P.c.g); partnerBlob = addBlobShadow(P.c.g, 1.1, { opacity: 0.3 })
  addFace(G.c); addFace(P.c); drawBadge('calm')
  G.flag.visible = P.flag.visible = true
  // 現場監督（白いヘルメット）
  BOSS.c = makeChar('male-d', 2.4, 'idle'); if (BOSS.c) { addFace(BOSS.c); BOSS.c.helmetK = 1.5; addHelmet(BOSS.c, 0xfdfdf8, 0xd62828); BOSS.c.g.visible = false; scene.add(BOSS.c.g); addBlobShadow(BOSS.c.g, 1.15, { opacity: 0.28 }) }
  // 作業員2人
  for (const [x, z, ry, an] of [[-2.6, -12.6, 0.8, 'interact-right'], [-0.9, -17.2, -2.6, 'pick-up']]) { const w = makeChar('male-e', 1.7, an); w.g.position.set(x, 0, z); w.g.rotation.y = ry; w.helmetK = 1.55; addHelmet(w, 0xffd21a, 0xffffff); scene.add(w.g); WORKERS.push(w) }
}
const WORKERS = []
// 旗の持ち方: go = 白を大きく回す（流せ）、stop = 赤を横に突き出す（止まれ）
const _hand = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler()
function poseGuard(p, dt, t, state, asleep) {
  if (!p.c) return
  const go = state === 'go'
  p.pose = lerp(p.pose ?? 0, go ? 1 : 0, 1 - Math.exp(-dt * 10))
  const arm = p.c.armR
  if (arm) {
    if (asleep) arm.rotation.set(0.2, 0, -0.1)
    else if (go) { const s = Math.sin(t * 6); arm.rotation.set(-1.2 + s * 0.9, 0, -0.5) }
    else arm.rotation.set(0, 0, -1.45)
  }
  p.c.root.updateMatrixWorld(true)
  if (arm) arm.getWorldPosition(_hand); else p.c.g.getWorldPosition(_hand).add(new THREE.Vector3(0, 1, 0))
  const f = p.flag
  f.position.copy(_hand)
  // 旗竿: 止め＝道の方へ横に突き出す、流す＝頭の上で大きく振る
  const yaw = p.c.g.rotation.y + (p === P ? 0 : 0)
  f.rotation.order = 'YXZ'; f.rotation.y = yaw
  if (asleep) { f.rotation.x = 0; f.rotation.z = 1.2; f.position.y -= 0.3 }
  else if (go) { f.rotation.x = 0; f.rotation.z = Math.sin(t * 6) * 0.9 - 0.25 }
  else { f.rotation.x = 0; f.rotation.z = -1.35 }
  f.userData.cloth.material = go ? flagMat.white : flagMat.red
  waveFlag(f, t, go ? 1.6 : 0.7)
}

// ---------- 車（形はタイプごとに1回だけ作って使い回す）
const CAR_TYPES = {
  kei: { L: 3.4, W: 1.48, vmax: 8.2, acc: 2.6, prof: [[-1.7, 0.28], [-1.7, 1.55], [-1.55, 1.68], [0.9, 1.68], [1.45, 1.0], [1.7, 0.9], [1.7, 0.28]], belt: 0.98 },
  sedan: { L: 4.5, W: 1.72, vmax: 9.4, acc: 3.0, prof: [[-2.25, 0.3], [-2.25, 0.88], [-1.6, 0.98], [-0.95, 1.42], [0.6, 1.44], [1.25, 1.0], [2.2, 0.86], [2.25, 0.3]], belt: 0.98 },
  van: { L: 4.7, W: 1.75, vmax: 8.6, acc: 2.6, prof: [[-2.35, 0.3], [-2.35, 1.8], [-2.2, 1.9], [1.3, 1.9], [2.05, 1.1], [2.35, 0.95], [2.35, 0.3]], belt: 1.08 },
  truck: { L: 7.0, W: 2.15, vmax: 8.0, acc: 2.0, truck: true },
  bike: { L: 1.75, W: 0.6, vmax: 4.2, acc: 2.0, bike: true },
}
const PAINTS = [0xf4f4f0, 0x2b2f36, 0xc8202a, 0x2f6fb5, 0xe9e2cf, 0x8a9aa5, 0x3f7a4a, 0xf0c419, 0xd97a2b, 0x7a3fa0]
const MATS = {}
const mm = (k, f) => MATS[k] || (MATS[k] = f())
const glassM = () => mm('glass', () => std(0x1d2a38, { roughness: 0.12, metalness: 0.3, transparent: true, opacity: 0.72 }))
const darkM = () => mm('dark', () => std(0x1b1b1d, { roughness: 0.85 }))
const greyM = () => mm('grey', () => std(0xb8bcc2, { roughness: 0.4, metalness: 0.5 }))
const headM = () => mm('head', () => new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.9 }))
const tailM = () => mm('tail', () => new THREE.MeshStandardMaterial({ color: 0xc8101a, emissive: 0xff2020, emissiveIntensity: 0.35 }))
const brakeM = () => mm('brake', () => new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 2.2 }))
const paintM = c => mm('p' + c, () => std(c, { roughness: 0.32, metalness: 0.15, envMapIntensity: 1.2 }))
function ni(g) { return g.index ? g.toNonIndexed() : g }
function extrudeSide(pts, W, bevel = 0.06) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]); sh.closePath()
  const g = new THREE.ExtrudeGeometry(sh, { depth: W - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 })
  g.translate(0, 0, -(W - bevel * 2) / 2); g.rotateY(-Math.PI / 2)   // 形の x（前後）→ z、押し出し → x
  return ni(g)
}
function boxG(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return ni(g) }
function wheelsG(L, W, r = 0.31, front = 0.75) {
  const tires = [], hubs = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = new THREE.CylinderGeometry(r, r, 0.24, 14); t.rotateZ(Math.PI / 2); t.translate(sx * (W / 2 - 0.1), r, sz * (L / 2 - front)); tires.push(ni(t))
    const h = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.05, 10); h.rotateZ(Math.PI / 2); h.translate(sx * (W / 2 + 0.02), r, sz * (L / 2 - front)); hubs.push(ni(h))
  }
  return { tires, hubs }
}
const GEO = {}
function carGeo(type) {
  if (GEO[type]) return GEO[type]
  const T = CAR_TYPES[type], L = T.L, W = T.W, out = { paint: [], glass: [], dark: [], grey: [], head: [], tail: [], white: [] }
  if (T.truck) {
    // キャブ
    const cab = [[-1.0, 0.45], [-1.0, 2.25], [0.7, 2.25], [1.0, 1.25], [1.05, 0.45]]
    out.paint.push(extrudeSide(cab.map(([u, y]) => [u + L / 2 - 1.05, y]), W))
    out.glass.push(extrudeSide([[-0.95, 1.35], [-0.95, 2.15], [0.66, 2.15], [0.93, 1.35]].map(([u, y]) => [u + L / 2 - 1.05, y]), W + 0.02, 0.02))
    out.white.push(boxG(W + 0.1, 2.5, L - 2.3, 0, 0.55 + 1.25, -1.05))
    out.dark.push(boxG(W * 0.9, 0.3, L - 0.2, 0, 0.5, -0.05), boxG(W + 0.04, 0.18, 0.2, 0, 0.5, L / 2 - 0.02))
    const w = wheelsG(L, W + 0.02, 0.4, 1.0); out.dark.push(...w.tires); out.grey.push(...w.hubs)
    out.head.push(boxG(0.32, 0.16, 0.06, W / 2 - 0.3, 0.75, L / 2 + 0.02), boxG(0.32, 0.16, 0.06, -W / 2 + 0.3, 0.75, L / 2 + 0.02))
    out.tail.push(boxG(0.2, 0.14, 0.06, W / 2 - 0.2, 0.6, -L / 2 + 0.05), boxG(0.2, 0.14, 0.06, -W / 2 + 0.2, 0.6, -L / 2 + 0.05))
  } else if (T.bike) {
    const tor = (z) => { const t = new THREE.TorusGeometry(0.33, 0.045, 6, 18); t.rotateY(Math.PI / 2); t.translate(0, 0.36, z); return ni(t) }
    out.dark.push(tor(0.58), tor(-0.58))
    const bar = (a, b) => { const v = new THREE.Vector3().subVectors(b, a), len = v.length(); const c = new THREE.CylinderGeometry(0.03, 0.03, len, 5); c.translate(0, len / 2, 0); c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize())); c.translate(a.x, a.y, a.z); return ni(c) }
    const V = (y, z) => new THREE.Vector3(0, y, z)
    out.paint.push(bar(V(0.36, -0.58), V(0.36, 0)), bar(V(0.36, 0), V(0.78, -0.2)), bar(V(0.78, -0.2), V(0.78, 0.4)), bar(V(0.36, 0), V(0.78, 0.4)), bar(V(0.36, 0.58), V(0.95, 0.45)))
    out.dark.push(boxG(0.18, 0.06, 0.26, 0, 0.82, -0.22), boxG(0.5, 0.04, 0.04, 0, 0.97, 0.45))
    out.grey.push(boxG(0.32, 0.18, 0.24, 0, 0.82, 0.62))   // かご
  } else {
    const prof = T.prof, belt = T.belt
    // 下半分（ボディ色）
    const low = []; for (const [u, y] of prof) low.push([u, Math.min(y, belt)])
    out.paint.push(extrudeSide(low, W))
    // 窓まわり（ガラス）と屋根
    const up = prof.filter(([, y]) => y >= belt - 0.001); const bu = (i, j) => { const a = prof[i], b = prof[j]; return lerp(a[0], b[0], (belt - a[1]) / (b[1] - a[1] || 1)) }
    let ia = prof.findIndex(([, y]) => y > belt), ib = prof.length - 1 - [...prof].reverse().findIndex(([, y]) => y > belt)
    const g0 = [bu(ia - 1, ia), belt], g1 = [bu(ib, ib + 1), belt]
    const top = prof.slice(ia, ib + 1)
    out.glass.push(extrudeSide([g0, ...top.map(([u, y]) => [u, y - 0.06]), g1], W - 0.14, 0.03))
    const roofY = Math.max(...top.map(p => p[1]))
    const rf = top.filter(p => p[1] > roofY - 0.05)
    out.paint.push(extrudeSide([[rf[0][0] - 0.05, roofY - 0.07], [rf[0][0], roofY], [rf[rf.length - 1][0], roofY], [rf[rf.length - 1][0] + 0.05, roofY - 0.07]], W - 0.1, 0.03))
    // ピラー
    out.paint.push(boxG(W - 0.12, roofY - belt, 0.12, 0, (roofY + belt) / 2, lerp(rf[0][0], rf[rf.length - 1][0], 0.5) * 0 + (rf[0][0] + rf[rf.length - 1][0]) / 2))
    out.dark.push(boxG(W + 0.04, 0.2, 0.18, 0, 0.36, L / 2), boxG(W + 0.04, 0.2, 0.18, 0, 0.36, -L / 2))
    const w = wheelsG(L, W); out.dark.push(...w.tires); out.grey.push(...w.hubs)
    out.head.push(boxG(0.3, 0.12, 0.06, W / 2 - 0.28, 0.72, L / 2 + 0.01), boxG(0.3, 0.12, 0.06, -W / 2 + 0.28, 0.72, L / 2 + 0.01))
    out.tail.push(boxG(0.26, 0.14, 0.06, W / 2 - 0.22, 0.78, -L / 2 - 0.01), boxG(0.26, 0.14, 0.06, -W / 2 + 0.22, 0.78, -L / 2 - 0.01))
    out.white.push(boxG(0.42, 0.14, 0.03, 0, 0.5, L / 2 + 0.1), boxG(0.42, 0.14, 0.03, 0, 0.55, -L / 2 - 0.1))
    out.dark.push(boxG(0.12, 0.1, 0.18, W / 2 + 0.04, belt + 0.06, prof.find(([, y]) => y > belt) ? bu(ib, ib + 1) - 0.2 : 0), boxG(0.12, 0.1, 0.18, -W / 2 - 0.04, belt + 0.06, bu(ib, ib + 1) - 0.2))
  }
  for (const k in out) out[k] = out[k].length ? mergeGeometries(out[k]) : null
  return (GEO[type] = out)
}
function truckSideTex() {
  return mm('truckTex', () => {
    const t = canvasTex(512, 256, (x, w, h) => { x.fillStyle = '#f6f6f2'; x.fillRect(0, 0, w, h); x.fillStyle = '#2a7a4a'; x.fillRect(0, h - 46, w, 22); x.fillStyle = '#2a7a4a'; x.font = `900 64px ${FONT}`; x.textAlign = 'center'; x.fillText('まごころ配送', w / 2, 120); x.font = `900 30px ${FONT}`; x.fillText('いそいでます', w / 2, 168) })
    return std(0xffffff, { map: t, roughness: 0.6 })
  })
}
function makeCarMesh(type, color) {
  const geo = carGeo(type), g = new THREE.Group()
  const add = (k, m) => { if (!geo[k]) return null; const me = new THREE.Mesh(geo[k], m); me.castShadow = !m.transparent; me.receiveShadow = k === 'paint' || k === 'white'; g.add(me); return me }
  add('paint', paintM(color)); add('glass', glassM()); add('dark', darkM()); add('grey', greyM()); add('head', headM())
  const tail = add('tail', tailM()); add('white', type === 'truck' ? truckSideTex() : mm('plateW', () => std(0xf2f2ea)))
  return { g, tail }
}

// ---------- 車の流れ
let carId = 0
const shownCars = () => S.cars.filter(c => c.g.visible)
function lateralA(z) {
  if (z > SH0) return XA
  if (z > SH1) return lerp(XA, XB, sstep((SH0 - z) / (SH0 - SH1)))
  if (z > SH2) return XB
  if (z > SH3) return lerp(XB, XA, sstep((SH2 - z) / (SH2 - SH3)))
  return XA
}
function spawnCar(dir, type, z) {
  const T = CAR_TYPES[type]
  const color = type === 'truck' ? 0xf4f4f0 : type === 'bike' ? pick([0x2f6fb5, 0xc8202a, 0xf4f4f0, 0x3f7a4a]) : pick(PAINTS)
  const m = makeCarMesh(type, color)
  const c = { id: ++carId, dir, type, L: T.L, W: T.W, vmax: T.vmax * (0.92 + S.rand() * 0.16), acc: T.acc, z, v: T.vmax * 0.8, x: dir < 0 ? XA : XB, off: 0, g: m.g, tail: m.tail,
    wait: 0, honked: 0, complained: false, redWait: 0, force: false, passed: false, squeeze: 0, sqWith: null, nearIds: new Set(), mood: 0, bubT: 0, wob: 0, driver: null, anger: null, said: 0 }
  if (type === 'bike') c.x = dir < 0 ? -2.75 : 2.75
  m.g.rotation.y = dir > 0 ? 0 : Math.PI
  scene.add(m.g)
  // 運転手
  if (charsReady) {
    const dn = pick(DRIVERS)
    const d = makeChar(dn, type === 'bike' ? 1.25 : 1.05, type === 'bike' ? 'drive' : 'drive')
    if (d) {
      d.mixer.update(0.4)
      if (type === 'bike') d.g.position.set(0, 0.22, -0.15)
      else if (type === 'truck') d.g.position.set(-0.45, 0.95, L2(c) - 1.15)
      else d.g.position.set(-0.36, 0.28, type === 'kei' ? 0.05 : -0.1)
      m.g.add(d.g); c.driver = d
    }
  }
  c.anger = new THREE.Sprite(new THREE.SpriteMaterial({ map: angerTex(), transparent: true, depthTest: false, toneMapped: false })); c.anger.scale.setScalar(0.9); c.anger.visible = false; c.anger.renderOrder = 9; scene.add(c.anger)
  S.cars.push(c); placeCar(c)
  return c
}
const L2 = c => c.L / 2
function freeCar(c) { c.g.removeFromParent(); c.anger.removeFromParent(); if (c.bub) { c.bub.remove(); c.bub = null } }
const front = c => c.z + c.dir * c.L / 2
const back = c => c.z - c.dir * c.L / 2
const prog = c => c.dir * c.z
function passedLine(c) { return c.dir < 0 ? front(c) < SA - 0.15 : front(c) > SB + 0.15 }
function distLine(c) { return c.dir < 0 ? front(c) - SA : SB - front(c) }
const signalStop = c => c.dir < 0 ? S.flag !== 'go' : P.state !== 'go'
const inShared = c => c.dir < 0 ? (c.x > 0.45 && c.type !== 'bike' ? true : c.type === 'bike' && c.z < SH0 - 0.5 && c.z > SH3 + 0.5) : (c.z > -40 && c.z < -2)
function placeCar(c) {
  if (c.dir < 0) { const tx = c.type === 'bike' ? (c.z > SH0 - 0.5 || c.z < SH3 + 0.5 ? -2.75 : 0.65) : lateralA(c.z); c.x = c.type === 'bike' ? lerp(c.x, tx, 0.06) : tx }
  const x = c.x + c.off * (c.dir < 0 ? -1 : 1)
  // 向き（車線変更の傾き）
  let yaw = c.dir > 0 ? 0 : Math.PI
  if (c.dir < 0 && c.type !== 'bike') { const d = lateralA(c.z - 0.6) - lateralA(c.z + 0.6); yaw += Math.atan2(d, 1.2) * 1 }
  c.g.position.set(x, 0, c.z); c.g.rotation.y = yaw + Math.sin(c.wob * 20) * c.wob * 0.15
  if (c.tail) c.tail.material = c.braking ? brakeM() : tailM()
  c.anger.position.set(x, (c.type === 'truck' ? 3.1 : 2.2), c.z)
}

// 1台ずつ進める
function updateCars(dt) {
  const A = S.cars.filter(c => c.dir < 0).sort((a, b) => prog(b) - prog(a))
  const B = S.cars.filter(c => c.dir > 0).sort((a, b) => prog(b) - prog(a))
  for (const list of [A, B]) {
    let lastCar = null, lastBike = null
    for (const c of list) { c.leader = c.type === 'bike' ? lastBike : (lastCar && lastBike ? (prog(lastCar) < prog(lastBike) ? lastCar : lastBike) : lastCar || lastBike); if (c.type === 'bike') lastBike = c; else lastCar = c }
  }
  // 正面の相手（同じ1車線にいる逆向きの車）
  for (const c of S.cars) { c.opp = null; c.oppGap = Infinity }
  for (const a of A) {
    if (a.type === 'bike' || !inShared(a)) continue
    for (const b of B) {
      if (b.type === 'bike' || b.z > a.z || a.sqWith === b.id) continue
      if (!b.passed && !(b.force || P.state === 'go' && distLine(b) < 1.2 && b.v > 5)) continue
      const gap = front(a) - front(b)
      if (gap < a.oppGap) { a.opp = b; a.oppGap = gap }
      if (gap < b.oppGap) { b.opp = a; b.oppGap = gap }
    }
  }
  for (const c of S.cars) {
    const T = CAR_TYPES[c.type]
    let vmax = c.vmax
    if (c.z < -2 && c.z > -30) vmax = Math.min(vmax, c.type === 'bike' ? 3.6 : 6.4)
    if (c.squeeze > 0) vmax = Math.min(vmax, 1.7)
    let gap = Infinity
    if (c.leader && !(c.sqWith && c.leader.sqWith)) gap = Math.min(gap, Math.abs(back(c.leader) - front(c)) - (c.type === 'bike' ? 0.6 : 1.3))
    const ignore = c.type === 'bike' || c.force
    if (!c.passed && !ignore && signalStop(c)) {
      const d = distLine(c)
      if (!(d < 1.2 && c.v > 5)) gap = Math.min(gap, d)   // 止まれない距離ならそのまま行く
    }
    if (c.opp && c.oppGap < 14) gap = Math.min(gap, c.oppGap - 2.2)
    const vt = gap === Infinity ? vmax : clamp(Math.sqrt(2 * 6.5 * Math.max(0, gap)), 0, vmax)
    c.braking = vt < c.v - 0.3 || c.v < 0.3
    if (vt > c.v) c.v = Math.min(vt, c.v + c.acc * dt); else c.v = Math.max(vt, c.v - (c.oppGap < 9 ? 22 : 12) * dt)
    c.z += c.dir * c.v * dt
    if (!c.passed && passedLine(c)) { c.passed = true; if (c.dir < 0 && c.type !== 'bike') onPass(c); if (c.type === 'bike') onBikePass(c) }
    // 待ち
    if (!c.passed && c.v < 0.4) { c.wait += dt; if (c.leader == null || c.leader.passed) c.redWait += dt } else if (c.passed) c.redWait = 0
    // 幅寄せの横ずらし
    c.off = lerp(c.off, c.squeeze > 0 ? 0.95 : 0, 1 - Math.exp(-dt * 3))
    if (c.squeeze > 0 && c.sqWith) { const o = S.cars.find(k => k.id === c.sqWith); if (!o || (c.dir < 0 ? front(c) < back(o) - 0.5 : front(c) > back(o) + 0.5)) { c.squeeze = 0; c.sqWith = null } }
    c.wob = Math.max(0, c.wob - dt)
    placeCar(c)
    if (c.dir < 0 && c.off > 0.5) knockCones(c)
    moodCar(c, dt)
  }
  // 出ていった車
  for (let i = S.cars.length - 1; i >= 0; i--) { const c = S.cars[i]; if ((c.dir < 0 && c.z < END_A) || (c.dir > 0 && c.z > END_B)) { freeCar(c); S.cars.splice(i, 1) } }
  checkConflicts(A, B)
}
function onPass(c) { S.passed++ }
function onBikePass(c) { if (onScreen(c) && S.mode === 'play') { Snd.sfx('bell'); if (signalStop(c)) say(c, pick(TT().bikeSay), 'warm', 1.6); else ono(TT().bikeBell, carTop(c), 'yel', { size: 20 }) } }

// 正面衝突寸前・自転車ヒヤリ
function checkConflicts(A, B) {
  for (const a of A) for (const b of B) {
    if (b.z > a.z) continue
    const gap = front(a) - front(b)
    const bike = a.type === 'bike' || b.type === 'bike'
    if (bike) {
      if (!(a.type === 'bike' ? a.z < SH0 && a.z > SH3 : a.x > 0.25)) continue
      if (gap < 2.4 && gap > -1 && !a.nearIds.has(b.id)) {
        a.nearIds.add(b.id); b.nearIds.add(a.id)
        const car = a.type === 'bike' ? b : a, bk = a.type === 'bike' ? a : b
        car.v *= 0.25; bk.wob = 0.8
        if (S.mode === 'play' && S.time - S.lastBikeT > 3) { S.bike++; S.lastBikeT = S.time; Snd.sfx('screech'); ono(TT().bikeNear, mid(a, b), 'red', { size: 26 }); say(bk, TT().bikeNear, 'hot', 1.4); fx.shake(0.015, 0.25) }
      }
      continue
    }
    if (!inShared(a) || !b.passed) continue
    if (a.nearIds.has(b.id)) {
      // 止まって向き合ったら、幅寄せしてすれ違う
      if (!a.sqWith && a.v < 0.6 && b.v < 0.6 && gap < 9) { a.sqWith = b.id; b.sqWith = a.id; a.squeeze = b.squeeze = 1; if (S.mode === 'play' && onScreen(a)) { Snd.sfx('scrape'); ono(TT().squeeze, mid(a, b), '', { size: 20, life: 1.6 }) } }
      continue
    }
    if (gap < 8.5) {
      a.nearIds.add(b.id); b.nearIds.add(a.id)
      if (S.mode !== 'play') continue
      const pos = mid(a, b); S.lastCrashPos = pos
      const fresh = S.time - S.lastCrashT > 4
      Snd.sfx('screech'); Snd.sfx('honk', 1)
      if (fresh) {
        S.crash++; S.lastCrashT = S.time
        Snd.sfx('crash'); fx.moment(pos, { burst: { count: 30, color: 0xffe08a, speed: 3 }, shake: [0.03, 0.5], hitstop: 120 })
        ono(TT().crash, pos.clone().add(new THREE.Vector3(0, 1.5, 0)), 'red', { size: 46, life: 1.6 })
        say(a, pick(TT().crashA), 'hot', 2.2)
        startSlow(pos)
        later(0.55, () => { Snd.sfx('radio'); bossCome(S.crash >= 3 ? TT().bossOut : S.rand() < 0.2 ? TT().bossLunch : pick(TT().bossCrash), { stay: S.crash >= 3 ? 5 : 2.6 }) })
        if (S.crash >= 3) S.outT = 3.6
      } else say(a, pick(TT().crashA), 'hot', 1.6)
      a.anger.visible = b.anger.visible = true; a.mood = b.mood = 2
    }
  }
}
function mid(a, b) { return new THREE.Vector3((a.g.position.x + b.g.position.x) / 2, 1.2, (front(a) + front(b)) / 2) }
function knockCones(c) {
  for (const k of S.cones) {
    if (k.down > 0 || Math.abs(k.x + 0.2) > 0.3) continue
    if (Math.abs(k.z - c.z) < c.L / 2 + 0.2) { k.down = 0.001; k.dir = -1; if (S.mode === 'play') { S.cone++; Snd.sfx('cone'); if (S.cone % 3 === 1) ono(TT().cone, new THREE.Vector3(k.x, 1.2, k.z), 'yel', { size: 20 }) } }
  }
}
function updateCones(dt) {
  for (const k of S.cones) {
    if (k.down > 0 && k.down < 1) { k.down = Math.min(1, k.down + dt * 3.5); k.g.rotation.z = -sstep(k.down) * Math.PI / 2 * 0.95; k.g.position.x = k.x - sstep(k.down) * 0.35; k.g.position.y = sstep(k.down) * 0.2; if (k.bar) k.bar.visible = false }
  }
}
function resetCones() { for (const k of S.cones) { k.down = 0; k.g.rotation.z = 0; k.g.position.set(k.x, 0, k.z); if (k.bar) k.bar.visible = true } }

// 運転手の機嫌（待ち時間 → 吹き出し・クラクション・苦情）
const WAIT_HONK = 12, WAIT_MAD = 24
function moodCar(c, dt) {
  if (S.mode !== 'play' || c.type === 'bike') return
  c.bubT -= dt
  if (c.passed) { if (c.mood < 2) c.anger.visible = false; return }
  const vis = onScreen(c)
  if (c.type === 'truck' && c.redWait > 0 && signalStop(c) && !c.force && (!c.leader || c.leader.passed)) {
    if (c.redWait > 3 && c.said < 1) { c.said = 1; Snd.sfx('bighonk'); say(c, TT().truckWait, 'hot', 2); c.anger.visible = true; fx.squash(c.g, 0.06, 0.4) }
    if (c.redWait > 5 && c.said < 2) { c.said = 2; Snd.sfx('bighonk'); ono(TT().truckHonk, carTop(c), 'red', { size: 30 }); fx.squash(c.g, 0.08, 0.4) }
    if (c.redWait > 6.5) { c.force = true; say(c, TT().truckGo, 'hot', 2) }
  }
  if (c.wait > WAIT_HONK && c.honked === 0) { c.honked = 1; c.bubT = 3.5; if (vis) { Snd.sfx('honk', 0.8 + S.rand() * 0.3); say(c, pick(TT().wait), 'warm', 1.6) } }
  else if (c.wait > WAIT_HONK && c.bubT < 0 && c.v < 0.4) { c.bubT = 3.5 + S.rand() * 2; if (vis) { Snd.sfx('honk', 0.9); ono(pick(TT().honk), carTop(c), 'yel', { size: 22 }) } }
  if (c.wait > WAIT_MAD && !c.complained) { c.complained = true; S.honk++; c.anger.visible = true; c.mood = 1; if (vis) { Snd.sfx('honk', 1); say(c, pick(TT().angry), 'hot', 2.0) } }
}

// ---------- 相方（向こうの警備員）
function zoneHasOutbound() { return S.cars.some(c => c.dir < 0 && c.passed && c.z > SH3 - 1) }
function updatePartner(dt) {
  if (P.sleepT > 0) {
    P.sleepT -= dt
    if (P.sleepT <= 0) { play(P.c, 'idle'); say(P, TT().partnerWake, 'radio', 1.6) }
    return
  }
  // 相方は自分の側を何台か流したら止めて「どうぞー」。こっちが流さないままだと、また流し始める
  const waitB = S.cars.filter(c => c.dir > 0 && !c.passed && c.z > SB - 30).length
  P.t += dt
  if (P.state === 'go') {
    const done = P.t > 4.5 + Math.min(4, waitB) || (P.t > 1.5 && waitB === 0)
    if (S.flag === 'go') { P.delay += dt; if (P.delay > 0.55) setPartner('stop', false) }
    else if (done) setPartner('stop', true)
    else P.delay = 0
  } else {
    // 自分の側の最後の車が1車線を抜けたら「どうぞー」
    if (P.announce && !zoneHasInbound()) { P.announce = false; P.t = 0; if (S.mode === 'play') { Snd.sfx('radio'); say(P, TT().partnerGo, 'radio', 1.6) } }
    if (S.flag === 'go') { P.handed = false; P.delay = 0; P.announce = false }
    else if (!zoneHasOutbound() && waitB > 0 && (!P.handed || (!P.announce && P.t > 6))) { P.delay += dt; if (P.delay > 0.8) setPartner('go', false) }
    else P.delay = 0
  }
  // こっちも詰まってる
  if (S.mode === 'play') {
    const nB = S.cars.filter(c => c.dir > 0 && !c.passed).length + S.pendB
    P.fullT -= dt
    if (P.state !== 'go' && nB >= 6 && P.fullT < 0) { P.fullT = 7; Snd.sfx('radio'); say(P, TT().partnerFull.replace('{N}', nB), 'radio', 2.2) }
    // 昼すぎから、たまに居眠り
    if (S.time > HOUR * 4.5) { P.nextSleep -= dt; if (P.nextSleep < 0) { P.nextSleep = 26 + S.rand() * 16; if (S.rand() < 0.65) { P.sleepT = 5.5; play(P.c, 'sit', 0.3); say(P, TT().partnerSleep, 'radio', 5) } } }
  }
}

function setPartner(st, hand) {
  P.state = st; P.t = 0; P.delay = 0; P.handed = hand; P.announce = st === 'stop' && hand
}
const zoneHasInbound = () => S.cars.some(c => c.dir > 0 && c.type !== 'bike' && c.passed && back(c) < SH0 + 1)
// ---------- おばあちゃん
const GR = { c: null, st: 'off', t: 0, x: 0, z: 0, next: 0, bub: null }
function grannySpawn() {
  if (!charsReady) return
  if (!GR.c) { GR.c = makeChar('female-c', 1.45, 'walk'); scene.add(GR.c.g); addBlobShadow(GR.c.g, 0.9, { opacity: 0.3, floorY: 0.18 }) }
  GR.st = 'in'; GR.t = 0; GR.x = -(RW + 1.1); GR.z = 9; GR.c.g.visible = true; play(GR.c, 'walk', 0.2, 0.7)
}
function updateGranny(dt) {
  if (S.mode === 'play' && GR.st === 'off') { GR.next -= dt; if (GR.next < 0) { GR.next = 38 + S.rand() * 12; grannySpawn() } }
  if (!GR.c || GR.st === 'off') return
  GR.t += dt
  const g = GR.c.g
  if (GR.st === 'in') { GR.z -= dt * 1.2; g.rotation.y = Math.PI; if (GR.z < -4.4) { GR.z = -4.4; GR.st = 'ask'; GR.t = 0; play(GR.c, 'idle'); g.rotation.y = Math.PI * 1.25; askBubble() } }
  else if (GR.st === 'ask') { if (GR.t > 8.5) { GR.st = 'mad'; GR.t = 0; closeAsk(); if (S.mode === 'play') { S.granny++; Snd.sfx('grump'); sayG(TT().grannyMad, 'hot', 2.4) } play(GR.c, 'emote-no') } }
  else if (GR.st === 'thanks' || GR.st === 'mad') { if (GR.t > 2.2) { GR.st = 'out'; play(GR.c, 'walk', 0.2, 0.7) } }
  else if (GR.st === 'out') { GR.z += dt * 1.2; g.rotation.y = 0; if (GR.z > 14) { GR.st = 'off'; g.visible = false } }
  g.position.set(GR.x, 0.18, GR.z)
}
function askBubble() {
  closeAsk()
  const el = document.createElement('div'); el.className = 'sb granny'; el.innerHTML = `${esc(pick(TT().grannyAsk))}<small>${esc(TT().grannyTap)}</small>`
  el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); answerGranny() })
  $('#fx').appendChild(el); GR.bub = el; S.fxList.push({ el, who: GR, t: 0, life: 99, kind: 'sb' })
  if (S.mode === 'play') Snd.sfx('tap')
}
function closeAsk() { if (GR.bub) { const i = S.fxList.findIndex(f => f.el === GR.bub); if (i >= 0) S.fxList.splice(i, 1); GR.bub.remove(); GR.bub = null } }
function answerGranny() {
  if (GR.st !== 'ask') return
  Snd.init(); closeAsk(); GR.st = 'thanks'; GR.t = 0; S.candy++
  Snd.sfx('candy'); sayG(TT().grannyThanks, 'warm', 2.2); play(GR.c, 'emote-yes'); G.pointT = 1.2
}
function sayG(text, cls, life) { if (GR.c) say(GR, text, cls, life) }

// ---------- 文字の演出（DOM）
const _w = new THREE.Vector3()
function toScreen(p) { _w.copy(p).project(camera); return { x: (_w.x + 1) / 2 * innerWidth, y: (1 - _w.y) / 2 * innerHeight, z: _w.z } }
function onScreen(c) { const s = toScreen(c.g.position); return s.z < 1 && s.x > -20 && s.x < innerWidth + 20 && s.y > -20 && s.y < innerHeight + 20 }
function carTop(c) { return new THREE.Vector3(c.g.position.x, c.type === 'truck' ? 3.0 : 2.0, c.z) }
function ono(text, pos, cls = '', o = {}) {
  const el = document.createElement('div'); el.className = 'ono ' + cls; el.textContent = text
  el.style.fontSize = (o.size ?? 30) + 'px'; $('#fx').appendChild(el)
  S.fxList.push({ el, pos: pos.clone(), t: 0, life: o.life ?? 1.1, rise: o.rise ?? 0.8, kind: 'ono', rot: (Math.random() - 0.5) * 14 })
}
function say(who, text, cls = '', life = 1.6) {
  if (who.bub && who !== GR) { who.bub.remove(); const i = S.fxList.findIndex(f => f.el === who.bub); if (i >= 0) S.fxList.splice(i, 1) }
  const el = document.createElement('div'); el.className = 'sb ' + cls; el.textContent = text; $('#fx').appendChild(el)
  if (who !== GR) who.bub = el
  S.fxList.push({ el, who, t: 0, life, kind: 'sb' })
}
function bossSay(text) { if (G.c) say(G, text, 'boss', 2.2) }
const _hp = new THREE.Vector3()
function anchorOf(who, out) {
  if (who === G || who === P || who === GR || who === BOSS) { const c = who.c; if (c && c.head) { c.head.getWorldPosition(out); out.y += 0.85 } else out.set(0, 2, 0); return out }
  return out.copy(carTop(who)).add(new THREE.Vector3(0, 0.4, 0))
}
function updateFx(dt) {
  const keep = []
  for (const f of S.fxList) {
    f.t += dt
    if (f.t > f.life || (f.who && f.who.g && !f.who.g.parent)) { f.el.remove(); if (f.who && f.who.bub === f.el) f.who.bub = null; continue }
    let p
    if (f.kind === 'ono') { _hp.copy(f.pos); _hp.y += f.rise * f.t; p = toScreen(_hp) }
    else p = toScreen(anchorOf(f.who, _hp))
    const k = f.t / f.life, sc = f.kind === 'ono' ? (f.t < 0.12 ? 0.6 + f.t / 0.12 * 0.6 : 1.2 - Math.min(0.2, (f.t - 0.12) * 1.2)) : (f.t < 0.1 ? 0.7 + f.t * 3 : 1)
    const w = f.el.offsetWidth, h = f.el.offsetHeight
    let x = p.x - w / 2, y = p.y - h - (f.kind === 'sb' ? 12 : 0)
    x = clamp(x, 8, innerWidth - w - 8); y = clamp(y, 8, innerHeight - h - 8)
    f.el.style.transform = `translate(${x}px,${y}px) scale(${sc})${f.rot ? ` rotate(${f.rot}deg)` : ''}`
    f.el.style.opacity = k > 0.8 ? (1 - k) / 0.2 : 1
    keep.push(f)
  }
  S.fxList = keep
  // 吹き出しどうしが重ならないようにずらす（古いものから消す）
  const els = keep.map(f => f.el)   // 同時に出す文字は2つまで
  for (const el of tidyTexts(els, { max: 2, margin: 8, top: 52 })) { const f = S.fxList.find(k => k.el === el); if (f && f.who !== GR) f.t = Math.max(f.t, f.life * 0.85) }
}
function clearFx() { for (const f of S.fxList) f.el.remove(); S.fxList = []; for (const c of S.cars) c.bub = null; G.bub = P.bub = null; GR.bub = null; BOSS.bub = null }
let laterQ = []
function later(t, f) { laterQ.push({ t, f }) }
function updateLater(dt) { const run = []; laterQ = laterQ.filter(l => { l.t -= dt; if (l.t <= 0) { run.push(l.f); return false } return true }); for (const f of run) f() }

// ---------- 列の長さの札（画面の外まで並んでいる台数）
const qTags = { A: null, B: null }
function makeTag() { const el = document.createElement('div'); el.className = 'qTag'; el.hidden = true; $('#vPlay').appendChild(el); return el }
function updateTags() {
  if (S.mode !== 'play') { for (const k in qTags) if (qTags[k]) qTags[k].hidden = true; return }
  qTags.A ??= makeTag(); qTags.B ??= makeTag()
  for (const [k, dir, pend] of [['A', -1, S.pendA], ['B', 1, S.pendB]]) {
    const el = qTags[k], wait = S.cars.filter(c => c.dir === dir && !c.passed)
    const off = wait.filter(c => !onScreen(c)).length + pend
    if (off <= 0) { el.hidden = true; continue }
    el.hidden = false; el.textContent = TT().queueN.replace('{N}', off); el.classList.toggle('hot', off >= 4)
    // 札は、見えている列の一番うしろの少し先に置く
    const lastVis = wait.filter(onScreen).sort((a, b) => prog(a) - prog(b))[0]
    const p = toScreen(lastVis ? new THREE.Vector3(lastVis.g.position.x, 1.6, back(lastVis) - dir * 1.5) : new THREE.Vector3(dir < 0 ? XA : XB, 1.6, dir < 0 ? 8 : -45))
    const w = el.offsetWidth, h = el.offsetHeight
    el.style.transform = `translate(${clamp(p.x - w / 2, 8, innerWidth - w - 8)}px,${clamp(p.y - h / 2, 60, innerHeight - h - 8)}px)`
  }
}

// ---------- 交通量（時間で増える）
function rates() {
  const h = S.time / HOUR // 0〜8
  const rush = 1 + 0.35 * Math.exp(-((h - 4) ** 2) / 0.8) + 0.6 * sstep((h - 5.5) / 2)
  const base = 0.085 + 0.017 * h
  return { a: base * rush * 1.05, b: base * rush }
}
S.pendA = 0; S.pendB = 0; S.accA = 0; S.accB = 0
function chooseType(dir) {
  const h = S.time / HOUR, r = S.rand()
  if (h > 0.8 && r < 0.06) return 'bike'
  if (dir < 0 && h > 1.4 && r < 0.2) return 'truck'
  const r2 = S.rand(); return r2 < 0.35 ? 'kei' : r2 < 0.75 ? 'sedan' : 'van'
}
function canSpawn(dir, type) {
  const L = CAR_TYPES[type].L, list = S.cars.filter(c => c.dir === dir)
  if (!list.length) return true
  const last = list.sort((a, b) => prog(a) - prog(b))[0]
  return dir < 0 ? back(last) < SPAWN_A - L / 2 - 2 : back(last) > SPAWN_B + L / 2 + 2
}
function updateSpawns(dt) {
  if (S.noSpawn) return
  const r = rates()
  S.accA += dt * r.a; S.accB += dt * r.b
  while (S.accA >= 1) { S.accA -= 1; S.pendA++ }
  while (S.accB >= 1) { S.accB -= 1; S.pendB++ }
  if (S.pendA > 0) { const t = S.nextTA ??= chooseType(-1); if (canSpawn(-1, t)) { spawnCar(-1, t, SPAWN_A); S.pendA--; S.nextTA = null } }
  if (S.pendB > 0) { const t = S.nextTB ??= chooseType(1); if (canSpawn(1, t)) { spawnCar(1, t, SPAWN_B); S.pendB--; S.nextTB = null } }
}

// ---------- 旗（操作はこれ1つ）
function setFlag(f, user = true) {
  if (S.flag === f) return
  S.flag = f; S.flagT = 0
  syncFlagBtn()
  if (user) { Snd.sfx(f === 'go' ? 'whistle' : 'whistleL'); Snd.sfx('flag') }
}
function toggleFlag() {
  if (S.mode !== 'play' || S.endT > 0 || S.outT > 0) return
  Snd.init()
  setFlag(S.flag === 'go' ? 'stop' : 'go')
  const b = $('#bFlag'); b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 90)
  if (S.tut === 1) { S.tut = 2; tutHint(null) } else if (S.tut === 3) { S.tut = 4; tutHint(null); store.set('tutDone', '1') }
}
function syncFlagBtn() {
  const b = $('#bFlag'), go = S.flag === 'go', T = TT()
  b.classList.toggle('go', go); b.classList.toggle('wave', go)
  $('#flagTxt').textContent = go ? T.flagGo : T.flagStop
  b.setAttribute('aria-label', go ? T.flagGoS : T.flagStopS)
}

// ---------- チュートリアル（最初の1回だけ）
function tutHint(text) {
  const h = $('#hint'), fg = $('#finger')
  if (!text) { h.hidden = true; fg.hidden = true; return }
  h.textContent = text; h.hidden = false; fg.hidden = false
  const r = $('#bFlag').getBoundingClientRect(); fg.style.transform = `translate(${r.left + r.width / 2 - 14}px,${r.top - 52}px)`
}
function updateTutorial() {
  if (S.mode !== 'play' || !S.tut) return
  if (S.tut === 1 && S.time > 1) { if ($('#hint').hidden) tutHint(isTouch ? TT().tut1 : TT().tut1PC) }
  if (S.tut === 2 && S.flag === 'go' && S.flagT > 7) { S.tut = 3; tutHint(TT().tut2) }
  if (S.tut === 4 && S.flag === 'stop' && S.flagT > 1) S.tut = 0
}

// ---------- ゲームの進行
function clockText() { const m = Math.min(SHIFT.h1 * 60, SHIFT.h0 * 60 + Math.floor(S.time / HOUR * 60)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
function updateGame(dt) {
  if (S.mode === 'play' || S.mode === 'title') {
    if (S.mode === 'play' && S.endT <= 0 && S.outT <= 0) {
      S.time += dt
      if (S.time >= SHIFT.sec) { S.endT = 3.2; Snd.sfx('chime'); bossCome(TT().bossEnd, { mood: 'happy', fast: false, stay: 3 }); G.happyT = 3.2; setFlag('stop', false) }
      // 昼と夕方のひとこと
      if (!S.saidLunch && S.time > HOUR * 4) { S.saidLunch = true; Snd.sfx('radio'); bossSay(TT().lunch) }
      if (!S.saidBusy && S.time > HOUR * 6.2) { S.saidBusy = true; Snd.sfx('radio'); bossSay(TT().busy) }
    }
    if (S.mode === 'title') { S.time = (S.time + dt) % SHIFT.sec; autoFlag(dt) } else if (S.auto) autoFlag(dt)
    S.flagT += dt
    updateSpawns(dt); updateCars(dt); updatePartner(dt); updateGranny(dt); updateCones(dt); updateLater(dt); updateBoss(dt); updateTutorial()
    if (S.endT > 0) { S.endT -= dt; if (S.endT <= 0) toResult(false) }
    if (S.outT > 0) { S.outT -= dt; if (S.outT <= 0) toResult(true) }
  }
}
// タイトル画面と検証の自動操作（そこそこ上手い人）
function autoFlag(dt) {
  // 向こうから1車線に入っている／入りそうな車がいない時だけ流す
  const danger = P.state === 'go' || zoneHasInbound()
  const waitA = S.cars.filter(c => c.dir < 0 && !c.passed).length
  if (S.flag === 'stop') { if (!danger && waitA > 0 && S.flagT > 2.5) setFlag('go', S.mode === 'play') }
  else if (S.flagT > 6 + Math.min(4, waitA) || (waitA === 0 && S.flagT > 2)) setFlag('stop', S.mode === 'play')
}

// ---------- 光（朝 → 昼 → 夕方）
const _c1 = new THREE.Color(), _c2 = new THREE.Color()
function updateLight() {
  const h = S.time / HOUR
  const k1 = sstep(h / 4), k2 = sstep((h - 5) / 3)
  _c1.copy(SKY.m).lerp(SKY.n, k1).lerp(SKY.e, k2); scene.background.copy(_c1); scene.fog.color.copy(_c1)
  lk.sun.color.setHex(0xfff0dc).lerp(_c2.setHex(0xffb070), k2); lk.sun.intensity = 2.4 - k2 * 0.6
  lk.hemi.intensity = 0.75 - k2 * 0.15
}

// ---------- カメラ（画面の形に合わせて、道の手前から相方まで全部入る距離）
const FIT = [[-RW, 0, 3.5], [RW, 0, 3.5], [-RW, 0, -31], [RW, 0, -31], [GUARD[0], 2.4, GUARD[1]], [PARTNER[0], 2.6, PARTNER[1]]]
function frameCamera() {
  const W = innerWidth, H = innerHeight
  camera.aspect = W / H
  const land = W > H * 1.05
  const dir = (land ? new THREE.Vector3(1.0, 0.95, 0.62) : new THREE.Vector3(0.32, 1.25, 0.95)).normalize()
  const tgt = new THREE.Vector3(land ? 0.6 : 0.3, 0, land ? -10.5 : -10)
  const topPad = (land ? 56 : 64) / H * 2, botPad = (land ? 12 : 30) / H * 2, sideL = 10 / W * 2, sideR = (land ? 120 : 10) / W * 2
  let lo = 6, hi = 120
  for (let i = 0; i < 28; i++) {
    const d = (lo + hi) / 2
    camera.position.copy(tgt).addScaledVector(dir, d); camera.lookAt(tgt); camera.updateMatrixWorld(); camera.updateProjectionMatrix()
    let ok = true
    for (const p of FIT) { _w.set(...p).project(camera); if (_w.x < -1 + sideL || _w.x > 1 - sideR || _w.y > 1 - topPad || _w.y < -1 + botPad) { ok = false; break } }
    if (ok) hi = d; else lo = d
  }
  camera.position.copy(tgt).addScaledVector(dir, hi); camera.lookAt(tgt); camera.updateProjectionMatrix()
}

// ---------- 画面
const views = ['vTitle', 'vHow', 'vPlay', 'vResult']
function show(id) { for (const v of views) $('#' + v).hidden = v !== id; $('#moreBox').hidden = true }
function applyLang() {
  const T = TT(); document.documentElement.lang = S.lang
  for (const el of document.querySelectorAll('[data-t]')) el.innerHTML = T[el.dataset.t]
  $('#langTxt').textContent = S.lang === 'ja' ? 'EN' : 'JA'
  $('#bMoreX').setAttribute('aria-label', T.close)
  syncFlagBtn()
  if (!$('#moreBox').hidden) fillMore()
  if (S.mode === 'result' && S.result) drawSlip(S.stamped ? 1 : 0)
}
function resetRun() {
  for (const c of S.cars) freeCar(c); S.cars = []
  clearFx(); laterQ = []; closeAsk()
  Object.assign(S, { time: 0, flag: 'stop', flagT: 0, crash: 0, bike: 0, honk: 0, granny: 0, cone: 0, passed: 0, candy: 0, lastCrashT: -99, lastBikeT: -99, outT: 0, endT: 0, photo: null, photoPri: 0, pendA: 0, pendB: 0, accA: 0, accB: 0, nextTA: null, nextTB: null, saidLunch: false, saidBusy: false, result: null })
  P.state = 'go'; P.t = 0; P.handed = false; P.delay = 0; P.sleepT = 0; P.nextSleep = 30; P.fullT = 4; if (P.c) play(P.c, 'idle')
  GR.st = 'off'; GR.next = HOUR * 1.2; if (GR.c) GR.c.g.visible = false
  S.slowT = 0; S.slowPos = null; S.camShot = false; Snd.slow = 0; frameCamera(); G.happyT = 0
  BOSS.st = 'off'; BOSS.x = BOSS_HOME[0]; BOSS.z = BOSS_HOME[1]; if (BOSS.c) { BOSS.c.g.visible = false; BOSS.c.bub = null } BOSS.bub = null
  resetCones(); syncFlagBtn()
}
function seedTraffic() {
  // 出勤した時点で、こっちに3台・向こうから2台
  const tA = ['sedan', 'kei', 'van']; tA.forEach((t, i) => { const c = spawnCar(-1, t, SA + CAR_TYPES[t].L / 2 + 0.1 + i * 5.6); c.v = 0 })
  spawnCar(1, 'kei', -21); spawnCar(1, 'sedan', -33)
}
function startRun(seed) {
  Snd.init(); Snd.sfx('tap')
  S.seed = seed ?? ((Date.now() & 0xffffff) || 1); S.rand = mulberry(S.seed)
  resetRun(); S.mode = 'play'
  seedTraffic()
  S.tut = store.get('tutDone') ? 0 : 1
  show('vPlay'); $('#hClock').textContent = clockText(); tutHint(null)
  Snd.setTrack('play')
}
function toTitle() {
  Snd.sfx('tap'); resetRun(); S.mode = 'title'; S.rand = Math.random; S.time = HOUR * 1.5
  seedTraffic()
  show('vTitle'); Snd.setTrack('title')
}

// ---------- 結果（給料明細）
const today = () => { const d = new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` }
function calcResult(out) {
  const T = TT(), Y = D.YEN
  const hours = out ? Math.max(1, Math.floor(S.time / HOUR)) : SHIFT.hours
  const pay = [{ label: T.perCar, note: T.perCarN.replace('{N}', S.passed), yen: S.passed * Y.perCar }]
  if (S.candy) pay.push({ label: T.candy, note: T.candyN.replace('{N}', S.candy), yen: 0 })
  const slip = {
    lang: S.lang, no: 2, job: T.job, date: today(), wage: SHIFT.wage, hours, pay,
    ded: [
      { label: T.dCrash, note: T.dCrashN.replace('{N}', S.crash), yen: S.crash * Y.crash },
      { label: T.dBike, note: T.dBikeN.replace('{N}', S.bike), yen: S.bike * Y.bike },
      { label: T.dHonk, note: T.dHonkN.replace('{N}', S.honk), yen: S.honk * Y.honk },
      { label: T.dGranny, note: T.dGrannyN.replace('{N}', S.granny), yen: S.granny * Y.granny },
      { label: T.dCone, note: T.dConeN.replace('{N}', S.cone), yen: S.cone * Y.cone },
    ],
    boss: T.bossName, footer: T.footer,
  }
  const net = totals(slip).net
  const rank = out ? D.OUT_RANK : S.passed < 20 ? D.RANKS[1] : [...D.RANKS].reverse().find(r => net >= r.min)
  slip.comment = rank.cmt[S.lang]; slip.stamp = rank.st[S.lang]
  return { slip, net, rank, out, hours, crash: S.crash, passed: S.passed }
}
const slipTheme = { main: '#1f3a68', dark: '#0f1d36', accent: '#ffc21a', bg: '#2b3038' }
function drawSlip(k = 1) {
  const r = S.result; if (!r) return
  const fresh = calcResult(r.out); r.slip = { ...fresh.slip, comment: r.rank.cmt[S.lang], stamp: r.rank.st[S.lang] }
  drawPayslip($('#slip'), { ...r.slip, photo: S.photo, stampK: k }, slipTheme)
}
async function toResult(out) {
  S.slowT = 0
  if (!S.photo) capturePhoto(new THREE.Vector3(0, 0.5, -12), 0)
  S.mode = 'resultWait'; S.result = calcResult(out); S.resT = 0; S.stamped = false
  for (const id of ['#rBtns1', '#rBtns2', '#bMore']) $(id).classList.remove('on')
  tutHint(null); closeAsk()
  try { await document.fonts.ready } catch (e) {}
  S.mode = 'result'; drawSlip(0); show('vResult'); clearFx(); fitSlip(); Snd.setTrack(out ? null : 'end'); if (out) Snd.sfx('boo')
}
function fitSlip() {
  const c = $('#slip'); if ($('#vResult').hidden) return
  c.style.width = c.style.height = '0px'
  const box = c.parentElement.getBoundingClientRect(), side = $('.resSide').getBoundingClientRect()
  const row = getComputedStyle(c.parentElement).flexDirection === 'row'
  const aw = row ? box.width - side.width - 14 : box.width, ah = row ? box.height : box.height - side.height - 8
  const k = Math.max(0.05, Math.min(aw / 1080, ah / 1350))
  c.style.width = Math.floor(1080 * k) + 'px'; c.style.height = Math.floor(1350 * k) + 'px'
}
function updateReveal(dt) {
  if (S.mode !== 'result') return
  S.resT += dt
  if (S.resT > 0.6 && S.resT < 1.0) drawSlip(clamp((S.resT - 0.6) / 0.35, 0, 1))
  if (S.resT >= 1.0 && !S.stamped) { S.stamped = true; drawSlip(1); Snd.sfx('stamp'); fx.shake(0.012, 0.2) }
  if (S.resT > 1.3) for (const id of ['#rBtns1', '#rBtns2', '#bMore']) $(id).classList.add('on')
}
function finishReveal() { if (S.mode === 'result' && S.resT < 1.3) { S.resT = 1.29; updateReveal(0.02) } }
// 山場の写真（正方形）
function capturePhoto(pos, pri) {
  if (pri < S.photoPri && S.photo) return
  render()
  const src = renderer.domElement, W = src.width, H = src.height, p = toScreen(pos)
  const s = Math.min(W, H) * 0.62, cx = clamp(p.x / innerWidth * W, s / 2, W - s / 2), cy = clamp(p.y / innerHeight * H, s / 2, H - s / 2)
  const c = document.createElement('canvas'); c.width = c.height = 300
  try { c.getContext('2d').drawImage(src, cx - s / 2, cy - s / 2, s, s, 0, 0, 300, 300) } catch (e) { return }
  S.photo = c; S.photoPri = pri
}
async function saveCard() {
  Snd.sfx('tap'); finishReveal()
  try { await document.fonts.ready } catch (e) {}
  const a = document.createElement('a'); a.href = $('#slip').toDataURL('image/png'); a.download = `job-traffic-${S.result.net}.png`; document.body.appendChild(a); a.click(); a.remove()
}
function shareText() { const r = S.result, T = TT(); return T.share.replace('{Y}', (r.net < 0 ? '-' : '') + Math.abs(r.net).toLocaleString('en-US')).replace('{C}', S.lang === 'ja' ? `監督「${r.rank.cmt.ja}」` : `Boss: "${r.rank.cmt.en}"`) }
function xPost() { const text = shareText(); return { text, url: D.PUBLIC_URL, href: `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(D.PUBLIC_URL)}` } }
function openX() { if (!S.result) return; Snd.sfx('tap'); window.open(xPost().href, '_blank', 'noopener') }
// ほかのバカゲー
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
function fillMore() { const L = S.lang; $('#moreL').innerHTML = D.others.map(g => `<a href="${esc(g.url)}" target="_blank" rel="noopener"><img src="${esc(g.url)}og.png" alt="" width="1200" height="630" decoding="async"><b>${esc(g[L])}</b><span>${esc(L === 'ja' ? g.dj : g.de)}</span></a>`).join('') }
function openMore() { Snd.init(); Snd.sfx('tap'); fillMore(); $('#moreBox').hidden = false }
function closeMore() { if ($('#moreBox').hidden) return; $('#moreBox').hidden = true; Snd.sfx('tap') }

// ---------- 小物のテクスチャ
let _anger
function angerTex() { return _anger || (_anger = canvasTex(64, 64, (x) => { x.strokeStyle = '#e63946'; x.lineWidth = 7; x.lineCap = 'round'; for (const [a, b, c2, d] of [[14, 22, 26, 26], [22, 14, 26, 26], [50, 22, 38, 26], [42, 14, 38, 26], [14, 42, 26, 38], [22, 50, 26, 38], [50, 42, 38, 38], [42, 50, 38, 38]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke() } })) }

// ---------- 毎フレームの見た目
let animT = 0
function updateScene(dt) {
  animT += dt
  const t = animT
  if (G.c) {
    G.c.mixer.update(dt)
    if (G.pointT > 0) { G.pointT -= dt; play(G.c, 'interact-left') } else play(G.c, 'idle')
    poseGuard(G, dt, t, S.flag, false)
    setFace(G.c, guardExpr(dt))
  }
  if (P.c) { P.c.mixer.update(dt); poseGuard(P, dt, t + 1.3, P.state, P.sleepT > 0); setFace(P.c, P.sleepT > 0 ? 'sleep' : 'calm') }
  for (const w of WORKERS) w.mixer.update(dt)
  if (GR.c && GR.c.g.visible) GR.c.mixer.update(dt)
  if (excavator) { excavator.userData.top.rotation.y = Math.sin(t * 0.5) * 0.6; excavator.userData.boom.rotation.x = Math.sin(t * 0.9) * 0.2; excavator.userData.arm.rotation.x = Math.sin(t * 0.9 + 1) * 0.35 }
  if (arrowMat) arrowMat.color.setScalar(Math.floor(t * 2) % 2 ? 1 : 0.25)
  for (const c of S.cars) if (c.anger.visible) c.anger.scale.setScalar(0.8 + Math.sin(t * 10) * 0.12)
  updateLight()
}

// ---------- 入力
$('#bFlag').addEventListener('pointerdown', e => { e.preventDefault(); toggleFlag() })
window.addEventListener('keydown', e => {
  if (e.code === 'Escape') closeMore()
  if (S.mode === 'play' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'ArrowDown')) { e.preventDefault(); if (!e.repeat) toggleFlag() }
})

// ---------- ループ（固定60Hz）
function render() { look.update(); applyShotCam(); fx.applyCamera(); renderer.render(scene, camera) }
let acc = 0, lastT = performance.now()
function step() {
  const vdt = fx.update(STEP), k = slowK()
  if (vdt > 0) updateGame(STEP * k)
  updateSlow()
  updateScene(STEP * k); updateFx(STEP); updateReveal(STEP)
}
function loop() {
  requestAnimationFrame(loop)
  const now = performance.now(); let dt = (now - lastT) / 1000; lastT = now
  if (S.dbgPause) { Snd.tick(); render(); updateTags(); return }
  acc += Math.min(dt, 0.25)
  let n = 0; while (acc >= STEP && n < 8) { step(); acc -= STEP; n++ }
  if (n === 8) acc = 0
  if (S.mode === 'play') $('#hClock').textContent = clockText()
  updateTags()
  Snd.tick(); render()
}
function syncMute() { $('#icOn').hidden = Snd.muted; $('#icOff').hidden = !Snd.muted }
function resize() { renderer.setSize(innerWidth, innerHeight, false); frameCamera(); fitSlip() }

// ---------- 起動
buildWorld(); applyLang(); syncMute(); resize()
addEventListener('resize', resize)
$('#bStart').onclick = () => startRun()
$('#bHow').onclick = () => { Snd.init(); Snd.sfx('tap'); show('vHow') }
$('#bHowBack').onclick = () => { Snd.sfx('tap'); show('vTitle') }
$('#bAgain').onclick = () => startRun()
$('#bTitle').onclick = () => toTitle()
$('#bSave').onclick = saveCard
$('#bX').onclick = openX
$('#bMore').onclick = openMore
$('#bMoreT').onclick = openMore
$('#bMoreX').onclick = closeMore
$('#moreBox').addEventListener('click', e => { if (e.target === e.currentTarget) closeMore() })
$('#vResult').addEventListener('pointerdown', e => { if (!e.target.closest('button')) finishReveal() })
$('#bLang').onclick = () => { Snd.init(); S.lang = S.lang === 'ja' ? 'en' : 'ja'; store.set('lang', S.lang); applyLang(); Snd.sfx('tap') }
$('#bMute').onclick = () => { Snd.init(); Snd.setMute(!Snd.muted); syncMute() }
S.mode = 'title'; S.time = HOUR * 1.5; show('vTitle'); Snd.setTrack('title')
requestAnimationFrame(loop)
loadChars().then(() => { $('#loading').hidden = true; setupPeople(); if (S.mode === 'title') { for (const c of S.cars) freeCar(c); S.cars = []; seedTraffic() } })

// ---------- 検証用の窓口
window.JT = {
  S, Snd, D, P, G, GR, BOSS, camera, toScreen, xPost, calcResult, CAR_TYPES,
  get charsReady() { return charsReady },
  dbg: {
    pause(b = true) { S.dbgPause = b },
    step(n = 1, noRender) { for (let i = 0; i < n; i++) step(); if (!noRender) render() },
    start(seed, o = {}) { S.dbgPause = false; if (o.noTut) store.set('tutDone', '1'); startRun(seed); if (o.empty) { for (const c of S.cars) freeCar(c); S.cars = [] } },
    flag(f) { setFlag(f) }, toggle() { toggleFlag() },
    spawn(dir, type, z) { const c = spawnCar(dir, type, z ?? (dir < 0 ? SA + CAR_TYPES[type].L / 2 + 0.1 : SB - CAR_TYPES[type].L / 2 - 0.1)); if (z == null) c.v = 0; return c.id },
    setV(id, v) { const c = S.cars.find(c => c.id === id); if (c) c.v = v },
    clear() { for (const c of S.cars) freeCar(c); S.cars = [] },
    noSpawn(b = true) { S.noSpawn = b },
    setTime(t) { S.time = t },
    granny() { GR.next = 0; GR.st = 'off'; grannySpawn() }, answer() { answerGranny() },
    sleep() { P.sleepT = 5.5; play(P.c, 'sit') },
    over() { S.crash = 3; toResult(true) },
    toResult(out) { toResult(!!out); return new Promise(r => setTimeout(() => { S.resT = 1.29; updateReveal(0.05); r() }, 50)) },
    auto(b = true) { S.auto = b },
    faces() { return { g: G.c && G.c.expr, p: P.c && P.c.expr, boss: BOSS.c && BOSS.c.expr, hasG: !!(G.c && G.c.face), hasP: !!(P.c && P.c.face), hasB: !!(BOSS.c && BOSS.c.face) } },
    boss() { return { st: BOSS.st, x: +BOSS.x.toFixed(2), z: +BOSS.z.toFixed(2), vis: !!(BOSS.c && BOSS.c.g.visible) } },
    bossCome(l, o) { bossCome(l, o) },
    slow() { return { t: +(S.slowT || 0).toFixed(3), k: +slowK().toFixed(3), pri: S.photoPri, photo: !!S.photo, shot: !!S.slowShot } },
    helmet() { const w = WORKERS[0]; if (!w) return null; const b = new THREE.Box3(); let hm = null; w.head.traverse(o => { if (o.isMesh && !hm && o.geometry.type === 'SphereGeometry') hm = o }); b.setFromObject(hm); const s = b.getSize(new THREE.Vector3()); return { w: +s.x.toFixed(3), h: +s.y.toFixed(3) } },
    render() { render() },
    look(px, py, pz, tx, ty, tz, fov = 36) { S.dbgPause = true; camera.fov = fov; camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); camera.updateProjectionMatrix(); render() },
  },
  state() {
    return {
      mode: S.mode, flag: S.flag, pflag: P.state, time: +S.time.toFixed(2), clock: clockText(), crash: S.crash, bike: S.bike, honk: S.honk, granny: S.granny, cone: S.cone, passed: S.passed, candy: S.candy,
      pendA: S.pendA, pendB: S.pendB, grannySt: GR.st, partnerSleep: P.sleepT > 0, tut: S.tut,
      cars: S.cars.map(c => ({ id: c.id, dir: c.dir, type: c.type, z: +c.z.toFixed(2), x: +c.x.toFixed(2), v: +c.v.toFixed(2), passed: c.passed, wait: +c.wait.toFixed(1), sq: c.squeeze, force: c.force })),
    }
  },
}
window.__jtReady = true
