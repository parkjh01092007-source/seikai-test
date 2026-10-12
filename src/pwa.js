// PWA（spec-pwa.md）：Service Worker の登録、新しい版があるかの確かめ、今の版の表示。React を読み込まない（node の check から純関数を読める）。
// Service Worker の中身は public/sw.js。

// 今の版の印：ビルドした JS のファイル名（index-XXXX.js）。ビルドすると、全部が1つの JS になるので、このファイルの import.meta.url がその名前になる。
// npm run dev では src/pwa.js のまま（版の印なし）
export const scriptName = (url) => {
  const m = /\/(index-[^/?#]+\.js)(?:[?#]|$)/.exec(url ?? '')
  return m ? m[1] : null
}
export const CURRENT_BUILD = scriptName(import.meta.url)

// ビルドした日時（vite.config.js の define で埋め込む。写し先の vite.config.js に、その1行がないときは null）
export const BUILT_AT = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : null

// index.html の中の、アプリの JS のファイル名（なければ null）
export const htmlScriptName = (html) => {
  const m = /<script\b[^>]*\ssrc="([^"]*\/index-[^"/]+\.js)"/.exec(html ?? '')
  return m ? scriptName(m[1]) : null
}

// 新しい版があるか：公開されている index.html の JS の名前が、今の版と違えば true。どちらかが分からないときは false（お知らせを出さない）
export const hasNewBuild = (current, published) => current !== null && published !== null && current !== published

// 設定 → 一般 に出す版の文字。日時があればローカルの「YYYY-MM-DD HH:MM」、なければ版の印、どちらもなければ null
export function versionLabel(builtAt, build) {
  if (builtAt) {
    const d = new Date(builtAt)
    if (!Number.isNaN(d.getTime())) {
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }
  }
  return build
}

// ---- ブラウザで使うもの ----

// Service Worker を登録する（ビルドした版で、使えるブラウザだけ。npm run dev では登録しない）。範囲は、このページの場所（/seikai/ など）
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || CURRENT_BUILD === null) return
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(CURRENT_BUILD)}`).catch(() => { /* 登録できなくても、アプリは今までどおり動く */ })
}

// 公開されている index.html を、保存を使わずに取って、新しい版があるかを返す（取れないとき・電波がないときは false）
export async function checkForNewBuild() {
  if (!import.meta.env.PROD || CURRENT_BUILD === null) return false
  try {
    const res = await fetch(import.meta.env.BASE_URL, { cache: 'no-store' })
    if (!res.ok) return false
    return hasNewBuild(CURRENT_BUILD, htmlScriptName(await res.text()))
  } catch {
    return false
  }
}
