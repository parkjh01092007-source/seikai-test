import { useEffect, useRef } from 'react'
import { t } from '../text.js'
import { useModalLayer } from '../modalLayer.js'
import { Icon } from './Icon.jsx'

// スマホの「＋」と、押すと「＋」の上に縦に出るメニュー（＋は×に変わる）。幕・Esc・×で閉じる。
// items：[{ key, icon, label, onSelect, disabledReason? }]。disabledReason があると、押せない（aria-disabled。フォーカスは入る＝理由を読み上げに出すため）
// fabRef：「＋」ボタン（閉じたとき、フォーカスを戻す先。呼んだ側も入力画面を閉じたあとに使う）
export default function PlusMenu({ open, onToggle, onClose, items, fabRef }) {
  const layerRef = useRef(null)
  const closeToFab = () => { onClose(); fabRef.current?.focus({ preventScroll: true }) }
  useModalLayer(layerRef, open, { onEscape: closeToFab, focusables: 'button' })
  useEffect(() => { if (open) layerRef.current.querySelector('[role="menuitem"]')?.focus() }, [open])
  const move = (e) => {
    const keys = { ArrowDown: 1, ArrowUp: -1 }
    if (!(e.key in keys) && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const els = [...layerRef.current.querySelectorAll('[role="menuitem"]')]
    const i = els.indexOf(document.activeElement)
    els[e.key === 'Home' ? 0 : e.key === 'End' ? els.length - 1 : (i + keys[e.key] + els.length) % els.length]?.focus()
  }
  const label = open ? t('plusMenu.close') : t('plusMenu.open')
  return (
    <div ref={layerRef} className="plus-layer">
      {open && <div className="plus-scrim" aria-hidden="true" onClick={closeToFab} />}
      {open && (
        <div id="plus-menu" className="plus-menu" role="menu" aria-label={t('plusMenu.label')} onKeyDown={move}>
          {items.map((it) => (
            <button key={it.key} type="button" role="menuitem" className="plus-item" aria-disabled={it.disabledReason ? 'true' : undefined}
              aria-label={it.disabledReason ? t('plusMenu.disabledAria', { label: it.label, reason: it.disabledReason }) : undefined} title={it.disabledReason || undefined}
              onClick={() => { if (!it.disabledReason) it.onSelect() }}><Icon name={it.icon} />{it.label}</button>
          ))}
        </div>
      )}
      <button ref={fabRef} type="button" className="entry-fab" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'plus-menu' : undefined} onClick={onToggle}><Icon name={open ? 'close' : 'plus'} /></button>
    </div>
  )
}
