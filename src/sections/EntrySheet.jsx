import { useEffect, useRef } from 'react'
import { t } from '../text.js'
import { useModalLayer } from '../modalLayer.js'

// 下から出る編集画面（スマホの幅の仕訳の編集。spec-mobile.md 5.4）。中身（フォーム）は children。
// onClose：すぐ閉じる（Esc・「やめる」・# が変わったとき）。onOutside：外側（幕）を押したとき（変更の確認は呼んだ側。閉じるなら onClose を呼ぶ）。
// 後ろのスクロール止め・Esc・Tab の輪は modalLayer.js（メニューと共通）。inert は付けない：確認画面（<dialog>）が同じ階層で、後ろの画面ごと inert にすると確認画面の中まで効くため。
// aria-modal と幕で、後ろは操作できない。開いたとき、日付の入力欄にフォーカス
export default function EntrySheet({ nth, title, onClose, onOutside, children }) {
  const ref = useRef(null)
  const layerRef = useRef(null)
  useModalLayer(ref, true, { onEscape: onClose, focusables: 'input, select, textarea, button' })

  useEffect(() => {
    ref.current.querySelector('input[type="date"]')?.focus()
  }, [])

  // 画面のキーボードが出たとき（スマホ）：画面の見える範囲（visualViewport）に、入力画面の大きさを合わせる。キーボードの下に「やめる」「追加」が隠れないように。
  // キーボードがないとき（見える範囲と画面の高さがほぼ同じ）は、何もしない（今までの inset: 0 のまま）
  useEffect(() => {
    const vv = window.visualViewport
    const layer = layerRef.current
    if (!vv || !layer) return undefined
    const apply = () => {
      if (window.innerHeight - vv.height > 80) {
        layer.style.top = `${vv.offsetTop}px`
        layer.style.height = `${vv.height}px`
        layer.style.bottom = 'auto'
      } else {
        layer.style.top = layer.style.height = layer.style.bottom = ''
      }
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => { vv.removeEventListener('resize', apply); vv.removeEventListener('scroll', apply) }
  }, [])

  // ブラウザの戻る・進むなどで # が変わったら、入力を捨てて閉じる（確認画面と同じ決まり）
  useEffect(() => {
    window.addEventListener('hashchange', onClose)
    return () => window.removeEventListener('hashchange', onClose)
  }, [onClose])

  return (
    <div ref={layerRef} className="sheet-layer">
      <div className="sheet-scrim" aria-hidden="true" onClick={onOutside} />
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={title ?? t('entries.sheetTitle')}>
        <div className="sheet-grip" aria-hidden="true" />
        <div className="sheet-head">
          <span className="sheet-title">{title ?? t('entries.sheetTitle')}</span>
          {nth && <span className="sheet-nth">{nth}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}
