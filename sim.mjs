// 自動操作で1日を通して、減給と手取りの分布を見る。node sim.mjs [回数]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
const N = +(process.argv[2] || 4), PORT = 5472
const sv = spawn(process.execPath, ['server.mjs'], { cwd: import.meta.dirname, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await muteContext(ctx)
const p = await ctx.newPage(), errs = []; p.on('pageerror', e => errs.push(e.message))
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__jtReady && window.JT.charsReady)
for (let i = 0; i < N; i++) {
  const r = await p.evaluate(async (seed) => {
    JT.dbg.start(seed, { noTut: true }); JT.dbg.auto(true); JT.dbg.pause(true)
    let maxA = 0, maxB = 0
    for (let k = 0; k < 160 && JT.S.mode === 'play'; k++) { JT.dbg.step(60); const s = JT.state(); maxA = Math.max(maxA, s.cars.filter(c => c.dir < 0 && !c.passed).length + s.pendA); maxB = Math.max(maxB, s.cars.filter(c => c.dir > 0 && !c.passed).length + s.pendB) }
    JT.dbg.pause(false); await new Promise(r => setTimeout(r, 300))
    const s = JT.state(), R = JT.S.result
    return { mode: s.mode, passed: s.passed, crash: s.crash, bike: s.bike, honk: s.honk, granny: s.granny, cone: s.cone, candy: s.candy, maxA, maxB, net: R && R.net, stamp: R && R.slip.stamp }
  }, i + 1)
  console.log(JSON.stringify(r))
}
console.log('errors:', errs.length ? errs.join(' | ') : 'none')
await b.close(); sv.kill()
