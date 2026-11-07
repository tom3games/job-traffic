// OGP 画像（1200x630）: 片側1車線で正面衝突しかけた瞬間＋タイトル。node og.mjs
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const PORT = 5473
const sv = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, locale: 'ja-JP' }); await muteContext(ctx)
const p = await ctx.newPage(); await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__jtReady && window.JT.charsReady)
await p.evaluate(async () => {
  await document.fonts.ready
  JT.dbg.start(3, { noTut: true }); JT.dbg.pause(true); JT.dbg.noSpawn(true); JT.dbg.clear()
  JT.dbg.flag('go'); JT.P.state = 'stop'
  // 工事区間の真ん中で、こっちの軽と向こうのトラックが鼻先を突き合わせる
  const ia = JT.dbg.spawn(-1, 'kei', -11.2), ib = JT.dbg.spawn(1, 'truck', -19.2), a = JT.S.cars.find(c => c.id === ia), b = JT.S.cars.find(c => c.id === ib)
  for (const c of [a, b]) { c.passed = true; c.v = 3; c.vmax = 3 }
  a.g.children[0].material = a.g.children[0].material.clone(); a.g.children[0].material.color.setHex(0xf0c419)
  for (let i = 0; i < 90; i++) JT.dbg.step(1, true)
  for (const c of [a, b]) { c.vmax = 0; c.v = 0 }
  JT.dbg.step(40, true)
  for (const c of JT.S.cars) c.sqWith = null, c.squeeze = 0, c.off = 0
  const q = { x: 1.7, z: (a.z + b.z) / 2 }
  JT.dbg.look(q.x + 6.5, 6.2, q.z + 7.5, q.x - 2.2, 0.6, q.z - 0.5, 42); JT.dbg.step(1)
  for (const el of document.querySelectorAll('.qTag')) el.style.visibility = 'hidden'
  for (const id of ['#corner', '.hudTop', '#bFlag']) document.querySelector(id).style.visibility = 'hidden'
  const d = document.createElement('div')
  d.innerHTML = `<div style="position:fixed;left:40px;top:34px;z-index:99;font-family:'Zen Maru Gothic';color:#fff">
   <div style="display:inline-block;background:#ffc21a;color:#1d1a16;border:4px solid #1d1a16;padding:6px 16px;font-weight:900;font-size:28px;transform:rotate(-3deg);box-shadow:4px 4px 0 #1d1a16">1日だけ職場体験 #2</div>
   <div style="margin-top:10px;font-weight:900;font-size:112px;line-height:1;-webkit-text-stroke:6px #1d1a16;paint-order:stroke fill;text-shadow:0 8px 0 #1d1a16">交通<span style="color:#ffc21a">誘導</span></div>
   <div style="margin-top:14px;display:inline-block;background:#fff;color:#1d1a16;border:4px solid #1d1a16;border-radius:18px;padding:8px 18px;font-weight:900;font-size:30px">旗1本で片側通行。流すタイミングを間違えるな</div></div>`
  document.body.appendChild(d)
})
await p.waitForTimeout(300)
await p.screenshot({ path: 'og.png' })
await b.close(); sv.kill(); console.log('og.png')
