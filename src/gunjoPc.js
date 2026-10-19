import { useSyncExternalStore } from 'react'
import { usePhone, PIN_QUERY, FIX_QUERY } from './layout.js'

// 群青の PC の形かどうか（spec-design.md 9.1・作業19(d)）。群青を選んでいて、スマホの形（layout.js）ではない。
// 群青の PC のときだけ描く部品（メニューの閉じた形の「正解」の円、見出しの英字ラベルなど）を出すかどうかに使う。
// 見た目の切り替えは html の data-theme（themes.js の applyTheme）なので、その変化を見張る
const subscribe = (onChange) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
const isGunjo = () => document.documentElement.getAttribute('data-theme') === 'gunjo'

export const useGunjoPc = () => {
  const gunjo = useSyncExternalStore(subscribe, isGunjo)
  const phone = usePhone() // フックは、いつも同じ順番で呼ぶ。`gunjo && !usePhone()` と書くと、見た目を群青に切り替えたとき、呼ぶ数が変わって画面が真っ白になる（2026-10-14 の実機で見つかった）
  return gunjo && !phone
}

// メニューを固定できるか。群青の PC は、幅 PIN_MIN_WIDTH（1100px）以上のときだけ。ほかの見た目・スマホの形は、今までどおり（いつも true）
const subscribePin = (onChange) => {
  const m = window.matchMedia(PIN_QUERY)
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}
export const useCanPin = () => {
  const gunjoPc = useGunjoPc()
  const wide = useSyncExternalStore(subscribePin, () => window.matchMedia(PIN_QUERY).matches)
  return !gunjoPc || wide
}

// 一覧の領域だけが中でスクロールする高さか（群青の PC の仕訳。FIX_QUERY）。そのとき、一覧の領域は、キーボードで動かせるように tabindex を持つ
const subscribeFix = (onChange) => {
  const m = window.matchMedia(FIX_QUERY)
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}
export const useFixedEntries = () => {
  const gunjoPc = useGunjoPc()
  const tall = useSyncExternalStore(subscribeFix, () => window.matchMedia(FIX_QUERY).matches)
  return gunjoPc && tall
}
