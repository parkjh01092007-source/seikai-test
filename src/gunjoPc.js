import { useSyncExternalStore } from 'react'
import { usePhone } from './layout.js'

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
  return gunjo && !usePhone()
}
