import { useRef, useState, useEffect } from 'react'
import { t } from '../text.js'
import { useModalLayer } from '../modalLayer.js'
import { Icon } from './Icon.jsx'
import { formatDayLabel } from '../entryView.js'
import { initialNoSpendPick, toggleNoSpendPick, resolveNoSpendPick, noSpendPickStatus, NO_SPEND_BACK_DAYS } from '../ledgerLogic.js'

// スマホの「＋」メニュー → 「使っていない日」：日を選ぶ小さなポップアップ。
// days：noSpendPickerDays の結果（今日と過去 7 日。新しい日が先頭）。開いた時点で今日（未記録なら）が選択済み。日を押すと選択のオン・オフ（複数可）。
// 「OK」で onConfirm({ add, remove })（未記録の選択＝記録、記録済みの選択＝取り消し）。「閉じる」・Esc・幕で onClose（記録しない）
export default function NoSpendPicker({ days, onConfirm, onClose }) {
  const ref = useRef(null)
  const [selected, setSelected] = useState(() => initialNoSpendPick(days))
  useModalLayer(ref, true, { onEscape: onClose, focusables: 'button' })
  useEffect(() => { ref.current.querySelector('.ns-day:not([aria-disabled="true"])')?.focus() }, [])
  const status = noSpendPickStatus(days, selected)
  const { add, remove } = resolveNoSpendPick(days, selected)
  const summary = !status.ok ? t(status.reason === 'todayHasEntries' ? 'nsPick.todayHasEntries' : 'nsPick.none')
    : status.kind === 'add' ? t('nsPick.summaryAdd', { n: add.length })
    : status.kind === 'remove' ? t('nsPick.summaryRemove', { n: remove.length })
    : t('nsPick.summaryMixed', { add: add.length, remove: remove.length })
  return (
    <div className="ns-layer">
      <div className="ns-scrim" aria-hidden="true" onClick={onClose} />
      <div ref={ref} className="ns-pop" role="dialog" aria-modal="true" aria-labelledby="ns-title">
        <h3 id="ns-title">{t('nsPick.title')}</h3>
        <p className="ns-lead">{t('nsPick.lead', { days: NO_SPEND_BACK_DAYS })}</p>
        <div className="ns-days">
          {days.map((d, i) => {
            const on = selected.includes(d.date)
            const blocked = d.state === 'blocked'
            const recorded = d.state === 'recorded'
            const sub = blocked ? t('nsPick.blocked') : on ? t(recorded ? 'nsPick.willRemove' : 'nsPick.willAdd') : recorded ? t('nsPick.recorded') : ''
            const label = formatDayLabel(d.date)
            const caption = i === 0 ? (sub ? t('nsPick.todaySub', { state: sub }) : t('nsPick.today')) : sub // 今日は、小さい行に「今日・…」（日付の行を折り返さない）
            const state0 = blocked ? t('nsPick.blockedAria') : on ? t(recorded ? 'nsPick.willRemoveAria' : 'nsPick.willAddAria') : t(recorded ? 'nsPick.recorded' : 'nsPick.free')
            return (
              <button key={d.date} type="button" className={`ns-day${on ? ' on' : ''}`} aria-pressed={blocked ? undefined : on} aria-disabled={blocked ? 'true' : undefined}
                aria-label={t('nsPick.dayAria', { label: i === 0 ? t('nsPick.todayLabel', { label }) : label, state: state0 })} title={blocked ? t('nsPick.blockedAria') : undefined}
                onClick={() => { if (!blocked) setSelected(toggleNoSpendPick(days, selected, d.date)) }}>
                <span className="ns-t">{label}<i>{caption}</i></span>
                {!blocked && <Icon name={on ? (recorded ? 'close' : 'check') : recorded ? 'circleScribble' : 'circle'} />}
              </button>
            )
          })}
        </div>
        <p className="ns-summary" role="status">{summary}</p>
        <div className="sheet-actions">
          <button type="button" onClick={onClose}><Icon name="close" />{t('nsPick.close')}</button>
          <button type="button" className="primary" aria-disabled={status.ok ? undefined : 'true'} title={status.ok ? undefined : summary}
            onClick={() => { if (status.ok) onConfirm({ add, remove }) }}><Icon name="check" />{t('nsPick.ok')}</button>
        </div>
      </div>
    </div>
  )
}
