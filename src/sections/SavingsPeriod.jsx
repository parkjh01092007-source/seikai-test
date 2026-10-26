import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { canSelectEnd } from '../flowArt.js'
import { useModalLayer } from '../modalLayer.js'
import { t } from '../text.js'

// 貯蓄（群青 PC）の「表示する期間」：表示の終わりの月を選ぶダイアログ。年の送り・12 か月・「今月に戻す」。未来の月と、最初の記録の月より前は押せない。
// body に出す（container-type の中では position: fixed の基準が変わるため）。Esc・幕・「閉じる」で onClose。選んだら onPick(月)
export default function SavingsPeriod({ end, today, first, onPick, onClose }) {
  const ref = useRef(null)
  const nowYear = Number(today.slice(0, 4))
  const firstYear = Number((first ?? today).slice(0, 4))
  const [year, setYear] = useState(Number(end.slice(0, 4)))
  useModalLayer(ref, true, { onEscape: onClose, focusables: 'button:not(:disabled)' })
  useEffect(() => { ref.current.querySelector('button.on')?.focus() }, [])
  return createPortal(
    <div className="g-sv-layer">
      <div className="g-sv-scrim" aria-hidden="true" onClick={onClose} />
      <div ref={ref} className="g-sv-dlg" role="dialog" aria-modal="true" aria-labelledby="g-sv-dlg-t">
        <h3 id="g-sv-dlg-t">{t('savings.periodDialog')}</h3>
        <p className="note">{t('savings.periodNote')}</p>
        <div className="yr">
          <button type="button" aria-label={t('savings.prevYear')} disabled={year <= firstYear} onClick={() => setYear(year - 1)}>‹</button>
          <b>{t('savings.yearN', { n: year })}</b>
          <button type="button" aria-label={t('savings.nextYear')} disabled={year >= nowYear} onClick={() => setYear(year + 1)}>›</button>
        </div>
        <div className="mg">
          {Array.from({ length: 12 }, (_, i) => {
            const m = `${year}-${String(i + 1).padStart(2, '0')}`
            return <button key={m} type="button" className={m === end ? 'on' : undefined} aria-pressed={m === end} disabled={!canSelectEnd(m, today, first ?? '0000-00')} onClick={() => onPick(m)}>{t('savings.monthN', { n: i + 1 })}</button>
          })}
        </div>
        <div className="ft">
          <button type="button" onClick={() => onPick(today.slice(0, 7))}>{t('savings.resetNow')}</button>
          <button type="button" onClick={onClose}>{t('save.close')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
