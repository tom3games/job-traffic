// 撮影用: node shot.mjs [名前] [幅] [高さ] [js(省略可)]
import './mute-auto.mjs'  // テスト中は絶対に音を出さない（playwright を無音に差し替え）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const [name = 'a', w = '390', h = '844', js = ''] = process.argv.slice(2)
const PORT = 5471
const sv = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: +w, height: +h }, locale: 'ja-JP', deviceScaleFactor: 1 })
await muteContext(ctx)
const p = await ctx.newPage(), errs = []
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__jtReady && window.JT.charsReady, null, { timeout: 15000 })
await p.waitForTimeout(600)
if (js) { const r = await p.evaluate(js); if (r !== undefined) console.log(JSON.stringify(r)) }
await p.screenshot({ path: `shots/${name}.png` })
console.log('errors:', errs.length ? errs.join('\n') : 'none')
await b.close(); sv.kill()
