import { useEffect, useRef } from 'react'

// 画面の上に重なる層（スマホのメニュー、下から出る編集画面）の共通の動き。React の hook。
// active のあいだ：後ろの画面のスクロールを止める（html の overflow）、Esc で onEscape を呼ぶ、Tab を ref の中（focusables に当たる要素）だけで回す。
// inertSiblings が true なら、ref の要素の兄弟を inert にする（メニュー用。編集画面は、確認画面と同じ階層に出せないので付けない）。
// active でなくなる・消えるときに、全部元に戻す。
// アプリ内の確認画面（<dialog>）が開いている間は、Esc と Tab を扱わない（確認画面が自分で扱う）。
export function useModalLayer(ref, active, { onEscape, focusables, inertSiblings = false }) {
  const escapeRef = useRef(onEscape)
  escapeRef.current = onEscape

  useEffect(() => {
    if (!active) return
    const layer = ref.current
    const others = inertSiblings ? [...layer.parentElement.children].filter((el) => el !== layer) : []
    for (const el of others) el.inert = true
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = 'hidden'
    const onKey = (e) => {
      if (document.querySelector('dialog[open]')) return
      if (e.key === 'Escape') {
        escapeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...layer.querySelectorAll(focusables)].filter((el) => !el.disabled)
      const [first, last] = [items[0], items.at(-1)]
      if (!layer.contains(document.activeElement)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      for (const el of others) el.inert = false
      root.style.overflow = overflow
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, active, focusables, inertSiblings])
}
