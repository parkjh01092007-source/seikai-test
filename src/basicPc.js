import { useSyncExternalStore } from 'react'
import { usePhone } from './layout.js'

// 基本の PC の形かどうか（docs/plan-basic-pc-impl.md）。基本を選んでいて、スマホの形（layout.js）ではない。
// 基本の PC のときだけ変える部品（常に開いた縦タブ、見出しの入口名など）を出すかどうかに使う。見た目は basic-pc.css。
// 見た目の切り替えは html の data-theme（themes.js の applyTheme）なので、その変化を見張る（gunjoPc.js と同じ作り）
const subscribe = (onChange) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
const isBasic = () => document.documentElement.getAttribute('data-theme') === 'basic'

export const useBasicPc = () => {
  const basic = useSyncExternalStore(subscribe, isBasic)
  const phone = usePhone() // フックは、いつも同じ順番で呼ぶ（gunjoPc.js の注意と同じ）
  return basic && !phone
}
