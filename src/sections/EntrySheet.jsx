import { useEffect, useRef } from 'react'
import { t } from '../text.js'
import { useModalLayer } from '../modalLayer.js'

// 下から出る編集画面（スマホの幅の仕訳の編集。spec-mobile.md 5.4）。中身（フォーム）は children。
// onClose：すぐ閉じる（Esc・「やめる」・# が変わったとき）。onOutside：外側（幕）を押したとき（変更の確認は呼んだ側。閉じるなら onClose を呼ぶ）。
// 後ろのスクロール止め・Esc・Tab の輪は modalLayer.js（メニューと共通）。inert は付けない：確認画面（<dialog>）が同じ階層で、後ろの画面ごと inert にすると確認画面の中まで効くため。
// aria-modal と幕で、後ろは操作できない。開いたとき、日付の入力欄にフォーカス
export default function EntrySheet({ nth, onClose, onOutside, children }) {
  const ref = useRef(null)
  useModalLayer(ref, true, { onEscape: onClose, focusables: 'input, select, textarea, button' })

  useEffect(() => {
    ref.current.querySelector('input[type="date"]')?.focus()
  }, [])

  // ブラウザの戻る・進むなどで # が変わったら、入力を捨てて閉じる（確認画面と同じ決まり）
  useEffect(() => {
    window.addEventListener('hashchange', onClose)
    return () => window.removeEventListener('hashchange', onClose)
  }, [onClose])

  return (
    <div className="sheet-layer">
      <div className="sheet-scrim" aria-hidden="true" onClick={onOutside} />
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={t('entries.sheetTitle')}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <span className="sheet-title">{t('entries.sheetTitle')}</span>
          <span className="sheet-nth">{nth}</span>
        </div>
        {children}
      </div>
    </div>
  )
}
