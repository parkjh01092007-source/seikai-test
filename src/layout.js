import { useSyncExternalStore } from 'react'

// スマホの形にする条件（spec-mobile.md 第2章）：幅 960px 未満、または、指だけで操作する機械（折りたたみスマホを開いた横・タブレットも）。
// CSS の @media（nav.css と index.css の「スマホの形」）と同じ条件。変えるときは、3か所とも変える
export const PHONE_QUERY = '(max-width: 959.98px), (pointer: coarse) and (hover: none)'

const subscribe = (onChange) => {
  const m = window.matchMedia(PHONE_QUERY)
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

// スマホの形かどうか。幅や向きが変わると、すぐ描き直す
export const usePhone = () => useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches)
