import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// verify.mjs の共通部品。コピーして __NS__ を置き換え、ゲーム固有のテストを足す。node verify.mjs
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 5474
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 900))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
// テストは必ず await する（しないと例外が素通りして全部 pass になる）
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
// 日本語ロケール固定・エラー収集つきでページを開く
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__jtReady && window.JT.charsReady, null, { timeout: 15000 })
  return p
}
// 横のはみ出し
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
// 一画面に収まる（縦スクロール不要・ボタンが画面内）
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) canvas')) { if (!el.offsetParent) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  return { H, over: over.slice(0, 6) }
})
// 描画の輝度の散らばり（ほぼ単色＝何も描けていない）
const variance = (p, sel) => p.evaluate(sel => {
  const c = document.querySelector(sel), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 13) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
}, sel)
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [844, 390, 'land'], [667, 375, 'land-se'], [768, 1024, 'tab'], [1440, 900, 'pc']]

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r)); return r
})
await t('OGP 一式がある', async () => {
  const r = await p.evaluate(() => ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]')))
  expect(r.every(Boolean), JSON.stringify(r))
})


const st = () => p.evaluate(() => JT.state())
await t('タイトル: ロゴとシリーズ名・監督の一言', async () => { const r = await p.evaluate(() => [document.querySelector('.logo').textContent, document.querySelector('.bubble').textContent]); expect(/1日だけ職場体験/.test(r[0]) && /交通/.test(r[0]) && r[1].length > 10, r); return r[0] })
await t('出勤するとプレイ画面・旗は「止め」から', async () => { await p.click('#bStart'); await p.waitForTimeout(400); const s = await st(); const txt = await p.textContent('#flagTxt'); expect(s.mode === 'play' && s.flag === 'stop' && txt === '止め', JSON.stringify([s.mode, s.flag, txt])) })
await t('初回は操作の案内が出る（3行以内の説明＋指）', async () => { await p.waitForTimeout(1500); const r = await p.evaluate(() => [!document.querySelector('#hint').hidden, document.querySelector('#hint').textContent, !document.querySelector('#finger').hidden]); expect(r[0] && r[2], JSON.stringify(r)); return r[1] })
await t('旗ボタンのタップで 止め⇔流す が切り替わる', async () => { await p.click('#bFlag'); const a = (await st()).flag, ta = await p.textContent('#flagTxt'); await p.click('#bFlag'); const b = (await st()).flag; expect(a === 'go' && ta === '流す' && b === 'stop', [a, ta, b]); return [a, b] })
await t('スペースキーでも切り替わる', async () => { await p.keyboard.press('Space'); const a = (await st()).flag; await p.keyboard.press('Space'); const b = (await st()).flag; expect(a === 'go' && b === 'stop', [a, b]) })
await t('HUD にゲージ・メーター要素がない', async () => { const n = await p.evaluate(() => document.querySelectorAll('#vPlay progress,#vPlay meter,#vPlay [class*=bar],#vPlay [class*=gauge]').length); expect(n === 0, n) })
await t('流すと車が工事区間を右車線で抜ける（止めると停止線で止まる）', async () => {
  const r = await p.evaluate(() => { JT.dbg.start(5, { noTut: true }); JT.dbg.pause(true); JT.dbg.noSpawn(true); JT.dbg.clear(); const id = JT.dbg.spawn(-1, 'sedan'); JT.dbg.step(120, true); const z0 = JT.state().cars.find(c => c.id === id).z; JT.dbg.flag('go'); let maxX = -9; for (let i = 0; i < 300; i++) { JT.dbg.step(1, true); const c = JT.state().cars.find(c => c.id === id); if (c) maxX = Math.max(maxX, c.x) } const c = JT.state().cars.find(c => c.id === id); return { z0, maxX, z1: c && c.z, passed: JT.state().passed, crash: JT.state().crash } })
  expect(r.z0 > -4 && r.maxX > 1.5 && r.z1 < -24 && r.passed === 1 && r.crash === 0, JSON.stringify(r)); return r })
await t('向こうから来ている時に流すと「事故未遂」になる', async () => {
  const r = await p.evaluate(() => { JT.dbg.start(6, { noTut: true }); JT.dbg.pause(true); JT.dbg.noSpawn(true); JT.dbg.clear(); JT.dbg.spawn(-1, 'kei'); const b = JT.dbg.spawn(1, 'sedan', -24); JT.S.cars.find(c => c.id === b).passed = true; JT.dbg.flag('go'); JT.dbg.step(240, true); return { crash: JT.state().crash, cars: JT.state().cars.length } })
  expect(r.crash === 1, JSON.stringify(r)); return r })
await t('事故未遂のあと2台は幅寄せですれ違って抜ける（詰まりっぱなしにならない）', async () => {
  const r = await p.evaluate(() => { JT.dbg.step(60 * 12, true); return JT.state().cars.map(c => ({ dir: c.dir, z: c.z })) })
  expect(r.every(c => c.dir < 0 ? c.z < -24 : c.z > -2), JSON.stringify(r)); return r })
await t('向こうが空いてから流せば事故にならない（相方は止めて「どうぞー」）', async () => {
  const r = await p.evaluate(() => { JT.dbg.start(7, { noTut: true }); JT.dbg.pause(true); JT.dbg.noSpawn(true); JT.dbg.clear(); JT.dbg.spawn(-1, 'kei'); JT.dbg.spawn(1, 'sedan', -40); let t = 0; while ((JT.state().pflag === 'go' || JT.P.announce) && t < 1200) { JT.dbg.step(1, true); t++ } JT.dbg.flag('go'); JT.dbg.step(600, true); return { crash: JT.state().crash, passed: JT.state().passed, waitedSec: t / 60 } })
  expect(r.crash === 0 && r.passed === 1, JSON.stringify(r)); return r })
await t('3回で早退 → 明細に「早退」', async () => {
  const r = await p.evaluate(async () => { JT.dbg.start(8, { noTut: true }); JT.S.crash = 2; JT.S.time = 50; await JT.dbg.over(); await new Promise(r => setTimeout(r, 900)); return { mode: JT.S.mode, stamp: JT.S.result.slip.stamp, hours: JT.S.result.hours } })
  expect(r.mode === 'result' && r.stamp === '早退' && r.hours === 2, JSON.stringify(r)); return r })
await t('自転車は旗を無視して通る', async () => {
  const r = await p.evaluate(() => { JT.dbg.start(9, { noTut: true }); JT.dbg.pause(true); JT.dbg.noSpawn(true); JT.dbg.clear(); const id = JT.dbg.spawn(-1, 'bike'); JT.dbg.step(300, true); const c = JT.state().cars.find(c => c.id === id); return { flag: JT.state().flag, z: c && c.z } })
  expect(r.flag === 'stop' && r.z < -10, JSON.stringify(r)); return r })
await t('急ぐトラックは待たせると勝手に行く', async () => {
  const r = await p.evaluate(() => { JT.dbg.start(10, { noTut: true }); JT.dbg.pause(true); JT.dbg.noSpawn(true); JT.dbg.clear(); const id = JT.dbg.spawn(-1, 'truck'); JT.dbg.step(60 * 10, true); const c = JT.S.cars.find(c => c.id === id); return { force: c.force, z: c.z } })
  expect(r.force && r.z < -8, JSON.stringify(r)); return r })
await t('待たせすぎると苦情が数えられる', async () => {
  const r = await p.evaluate(() => { JT.dbg.start(11, { noTut: true }); JT.dbg.pause(true); JT.dbg.noSpawn(true); JT.dbg.clear(); JT.dbg.spawn(-1, 'sedan'); JT.dbg.step(60 * 26, true); return JT.state().honk })
  expect(r === 1, r) })
await t('おばあちゃん: 吹き出しをタップで答える → 飴ちゃん', async () => {
  await p.evaluate(() => { JT.dbg.start(12, { noTut: true }); JT.dbg.granny() }); await p.waitForFunction(() => JT.state().grannySt === 'ask', null, { timeout: 15000 })
  await p.click('.sb.granny', { force: true }); const s = await st(); expect(s.candy === 1 && s.grannySt === 'thanks', JSON.stringify([s.candy, s.grannySt])) })
await t('おばあちゃん: 放っておくと苦情', async () => {
  const r = await p.evaluate(() => { JT.dbg.start(13, { noTut: true }); JT.dbg.pause(true); JT.dbg.granny(); JT.dbg.step(60 * 24, true); return JT.state().granny }); expect(r === 1, r) })
await t('1日（8:00〜16:00）通すと給料明細（時給→勤務時間→総支給→控除→手取り→ひとこと→ハンコ）', async () => {
  const r = await p.evaluate(async () => { JT.dbg.start(14, { noTut: true }); JT.dbg.auto(true); JT.dbg.pause(true); for (let i = 0; i < 150 && JT.S.mode === 'play'; i++) JT.dbg.step(60, true); JT.dbg.pause(false); await new Promise(r => setTimeout(r, 1800)); const R = JT.S.result; return { mode: JT.S.mode, hours: R.hours, wage: R.slip.wage, net: R.net, stamp: R.slip.stamp, cmt: R.slip.comment, ded: R.slip.ded.map(d => d.label), x: JT.xPost(), btn: document.querySelector('#rBtns2').classList.contains('on') } })
  expect(r.mode === 'result' && r.hours === 8 && r.wage === 1300 && r.ded.length === 5 && r.stamp && r.cmt && r.btn, JSON.stringify(r)); return { net: r.net, stamp: r.stamp } })
await t('明細の絵が描けている（輝度の散らばり）', async () => { const v = await variance(p, '#slip'); expect(v > 500, v); return v })
await p.screenshot({ path: `${ROOT}/shots/result-phone.png` })
await t('X のポスト: intent/post・手取り・ハッシュタグ・公開URL', async () => { const x = await p.evaluate(() => JT.xPost()); expect(/^https:\/\/x\.com\/intent\/post\?/.test(x.href) && /手取り/.test(x.text) && /#1日だけ職場体験/.test(x.text) && x.url === 'https://tom3games.github.io/job-traffic/', JSON.stringify(x)); return x.text })
await t('明細の保存（PNG のダウンロード）', async () => { const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#bSave')]); expect(/job-traffic-.*\.png/.test(dl.suggestedFilename()), dl.suggestedFilename()) })
await t('ほかのバカゲー一覧（4本・居酒屋ホールを含む）', async () => { await p.click('#bMore'); const r = await p.evaluate(() => [...document.querySelectorAll('#moreL a')].map(a => a.href)); await p.click('#bMoreX'); expect(r.length === 4 && r.some(u => /job-izakaya/.test(u)), r) })
await t('英語に切り替わる（明細も英語）', async () => { await p.click('#bLang'); const r = await p.evaluate(() => [document.documentElement.lang, JT.S.result.slip.job, JT.xPost().text]); await p.click('#bLang'); expect(r[0] === 'en' && r[1] === 'Traffic guard' && /Take-home/.test(r[2]), r) })
await t('音: BGM と効果音が呼ばれている（鳴らさず回数で）', async () => { const r = await p.evaluate(() => ({ played: JT.Snd.played, calls: window.__soundCalls || 0 })); expect(r.played['bgm:play'] || r.played['whistle'] || r.calls > 0, JSON.stringify(r)); return Object.keys(r.played).length })
await t('ミュートが効く', async () => { await p.click('#bMute'); const m = await p.evaluate(() => JT.Snd.muted); await p.click('#bMute'); expect(m === true, m) })
await t('通しでエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })

await p.close()
// ---- 6サイズ × 全画面で一画面に収まる。画面の巡り方はゲームに合わせて書く
for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  const views = {}
  await q.waitForTimeout(300); views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.click('#bHowBack')
  await q.click('#bStart'); await q.waitForTimeout(500); views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await t(`${name}: 旗ボタンが押せる大きさで画面内`, async () => { const r = await q.evaluate(() => { const b = document.querySelector('#bFlag').getBoundingClientRect(); return [b.width, b.left, b.right, b.bottom, innerWidth, innerHeight] }); expect(r[0] >= 80 && r[1] >= 0 && r[2] <= r[4] && r[3] <= r[5], r) })
  await q.evaluate(async () => { await JT.dbg.toResult(false) }); await q.waitForTimeout(400); views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  await t(`${name}: 明細が読める大きさ`, async () => { const r = await q.evaluate(() => document.querySelector('#slip').getBoundingClientRect().width); expect(r >= 200, r); return Math.round(r) })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()
// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
