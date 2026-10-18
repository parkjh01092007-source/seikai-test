import { useSyncExternalStore } from 'react'

// スマホの形にする条件（spec-mobile.md 第2章）：幅 960px 未満、または、指だけで操作する機械（折りたたみスマホを開いた横・タブレットも）。
// CSS の @media（nav.css と index.css の「スマホの形」）と同じ条件。変えるときは、3か所とも変える
export const PHONE_QUERY = '(max-width: 959.98px), (pointer: coarse) and (hover: none)'

// 群青の PC で、メニューを「固定」できる最小の幅（spec-design.md 9.1）。固定は、パネルが中身の上に重なったまま開いておく形なので、狭いと中身の左が隠れすぎる。
// gunjo-pc.css の @media (min-width: 1100px) と同じ値（gunjoPc.check.js が確かめる）
export const PIN_MIN_WIDTH = 1100
export const PIN_QUERY = `(min-width: ${PIN_MIN_WIDTH}px)`

const subscribe = (onChange) => {
  const m = window.matchMedia(PHONE_QUERY)
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

// スマホの形かどうか。幅や向きが変わると、すぐ描き直す
export const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches)
