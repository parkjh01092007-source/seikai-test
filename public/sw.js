// アプリのファイルを端末に保存して、電波がなくても開けるようにする（spec-pwa.md 4章）。中身は全部の写し先で同じ（copy-public.mjs で写す）。
// 登録は src/pwa.js（ビルドした版だけ。npm run dev では登録しない）。登録のアドレスは sw.js?v=<版>（版はビルドした JS のファイル名）。
// 扱うのは、この Service Worker の範囲（scope。/seikai/ や /seikai-test/）の GET だけ。データ（localStorage）・セーブフォルダーには触らない。
//
// 保存の名前は「orenoyome|<scope>|<版>」。端末の保存場所（Cache Storage）はオリジンごとで、seikai と seikai-test で同じ場所なので、
// scope を名前に入れ、古い保存の掃除は、自分の scope で始まるものだけにする（もう片方のものを消さない）。
//
// 入れ替わり：新しい版のページが開くと、新しい sw.js?v=<新しい版> が登録される。インストール（新しい版のファイルの保存）が終わると、すぐに入れ替わる（skipWaiting・clients.claim）。
// ページはまずネットから取るので、古い Service Worker が動いている間に新しい版を開いても、新しい版のファイルはネットから取って出す。

const PREFIX = 'orenoyome|'
const scope = () => self.registration.scope
const version = () => new URL(self.location.href).searchParams.get('v') || 'none'
const cacheName = (s, v) => `${PREFIX}${s}|${v}`
// 自分の scope の、今の版ではない保存か（ほかの scope のもの・ほかのアプリのものは false）
const isOldOwnCache = (name, s, v) => name.startsWith(`${PREFIX}${s}|`) && name !== cacheName(s, v)
// index.html の中の、同じ範囲のファイル（script の src、link の href）の URL
const htmlAssets = (html, base) => [...html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)="([^"]+)"/g)].map((m) => new URL(m[1], base).href)
// CSS の中の url(...)（書体など）
const cssAssets = (css, base) => [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:')).map((u) => new URL(u, base).href)
const inScope = (url, s) => url.startsWith(s)

// 書体（woff2）：インストールのときは保存しない。使ったときに、保存する（下の fetch の「ほかのファイル」）。
// ただし、前の版の保存に同じ書体があれば、ネットを使わずに、新しい保存へ写す（書体のファイル名には中身の印がある。同じアドレス＝同じ中身）。
// 電波がなくて、まだ使っていない書体は、取れないので、書体の指定のあとの serif（システムの明朝体）で出る（機能と配置は変わらない）
const isFont = (url) => /\.woff2?(?:[?#]|$)/.test(url)
const splitFonts = (urls) => ({ now: [...urls].filter((u) => !isFont(u)), fonts: [...urls].filter(isFont) })
// store：Cache Storage（caches）。自分の scope の、今の版ではない保存だけから写す（もう片方の scope のものは見ない）。target：新しい保存
async function copyFonts(fontUrls, store, s, v, target) {
  const names = (await store.keys()).filter((n) => isOldOwnCache(n, s, v))
  const copied = []
  for (const url of fontUrls) {
    if (await target.match(url)) continue
    for (const name of names) {
      const hit = await (await store.open(name)).match(url)
      if (hit) { await target.put(url, hit); copied.push(url); break }
    }
  }
  return copied
}

// node の check から、上の純関数だけを試すための出口（Service Worker の中では使わない）
if (typeof self.__swTest === 'function') self.__swTest({ cacheName, isOldOwnCache, htmlAssets, cssAssets, inScope, isFont, splitFonts, copyFonts })

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const s = scope()
    const cache = await caches.open(cacheName(s, version()))
    const index = await fetch(s, { cache: 'no-store' })
    const html = await index.clone().text()
    await cache.put(s, index)
    const urls = new Set(htmlAssets(html, s).filter((u) => inScope(u, s)))
    for (const u of [...urls]) {
      if (!u.endsWith('.css')) continue
      const css = await (await fetch(u)).text()
      for (const a of cssAssets(css, u)) if (inScope(a, s)) urls.add(a)
    }
    for (const u of urls) if (u.endsWith('.webmanifest')) {
      const m = await (await fetch(u)).json()
      for (const i of m.icons ?? []) urls.add(new URL(i.src, u).href)
    }
    const { now, fonts } = splitFonts(urls) // 書体は、ここでは保存しない
    await cache.addAll(now)
    await copyFonts(fonts, caches, s, version(), cache) // 前の版の保存にあるものだけ、写す
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const s = scope(), v = version()
    for (const name of await caches.keys()) if (isOldOwnCache(name, s, v)) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const s = scope()
  if (req.method !== 'GET' || !inScope(req.url, s)) return
  if (req.cache === 'no-store') return // 新しい版があるかの確かめ（src/pwa.js）は、いつもネットから
  const name = cacheName(s, version())
  if (req.mode === 'navigate') {
    // ページ：まずネット（新しい版があれば、読み直したときに新しい版になる）。取れなければ、保存してある index.html。
    // ブラウザの HTTP の保存（GitHub Pages は 10 分）に古い index.html が残っていても使わないよう、サーバーに確かめる（no-cache）
    event.respondWith(fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).catch(async () => (await caches.open(name)).match(s)))
    return
  }
  // ほかのファイル：保存してあれば、それを出す（名前に版の印がある）。なければネットから取って、保存する
  event.respondWith((async () => {
    const cache = await caches.open(name)
    const hit = await cache.match(req)
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok) await cache.put(req, res.clone())
    return res
  })())
})
