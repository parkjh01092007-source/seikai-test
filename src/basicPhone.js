import { useSyncExternalStore } from 'react'
import { usePhone } from './layout.js'

// 基本のスマホの形かどうか（docs/plan-basic-pc-impl.md 18 章）。基本を選んでいて、スマホの形（layout.js）のとき。
// 基本のスマホのときだけ変える部品（見出しの構造など）を出すかどうかに使う。見た目は basic-phone.css。
// 見た目の切り替えは html の data-theme（themes.js の applyTheme）なので、その変化を見張る（basicPc.js と同じ作り）
const subscribe = (onChange) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
const isBasic = () => document.documentElement.getAttribute('data-theme') === 'basic'

export const useBasicPhone = () => {
  const basic = useSyncExternalStore(subscribe, isBasic)
  const phone = usePhone() // フックは、いつも同じ順番で呼ぶ（basicPc.js の注意と同じ）
  return basic && phone
}
