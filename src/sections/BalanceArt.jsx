import { t } from '../text.js'
import { formatYen } from '../ledgerLogic.js'
import { tiltDeg, coinCount, coinRows, TILT_TICKS } from '../balanceArt.js'

// 群青の PC の残高調整の、右の青い面（装飾）と、その上の天秤（spec-design.md 9 章・区切り16-1。見本は orenoyome-tools の plan-adjust-book）。
// 絵はぜんぶ CSS と、硬貨の刻みの小さなパス。画像・フォントは使わない（円・ウォンなど、特定の通貨の字も書かない）。読み上げには出さない（aria-hidden。差額・結果は画面の文字で伝える）。
// すべての点は、1つの基準（中心 x・梁の高さ y0・梁の半分の長さ L・角度 a）から CSS の変数で決まる（gunjo-pc.css の .g-scale）。
// cur：記録上の残高、actual：入力中の実際の残高。どちらも、画面がすでに持っている数字。null は「まだない」（科目を選ぶ前・入力前）

// 硬貨の刻み：菱形（ヒントの印と同じ形。0〜100 の枠で、中心が 50,50）
const MARK = 'M50 28L72 50L50 72L28 50Z'

function Pan({ side, value, maxValue, label }) {
  const rows = coinRows(coinCount(value, maxValue))
  return (
    <div className={`pan ${side}`}>
      <i className="apex" />
      <div className="strings"><i /><i /></div>
      {rows.length > 0 && (
        <div className="pile">
          {rows.map((n, r) => (
            <div className="row" key={r}>
              {Array.from({ length: n }, (_, i) => <i className="coin" key={i}><svg className="mark" viewBox="0 0 100 100"><path d={MARK} /></svg></i>)}
            </div>
          ))}
        </div>
      )}
      <div className="bowl" />
      <div className="cap"><small>{label}</small><b>{value === null ? '—' : formatYen(value)}</b></div>
    </div>
  )
}

export default function BalanceArt({ cur, actual }) {
  const maxValue = Math.max(Math.abs(cur ?? 0), Math.abs(actual ?? 0), 1)
  const balanced = cur !== null && actual !== null && cur === actual
  return (
    <div className="g-adj-panel" aria-hidden="true">
      <div className={`g-adj-art${balanced ? ' balanced' : ''}`}>
        <div className="g-adj-moon" />
        <div className="g-scale" style={{ '--a': `${tiltDeg(cur, actual)}deg` }}>
          <span className="chip">{t('adjustment.artBalanced')}</span>
          <div className="level l" /><div className="level r" />
          <div className="arc" />
          {TILT_TICKS.map((deg) => <i className="tick" key={deg} style={{ transform: `rotate(${deg}deg)` }} />)}
          <div className="ref" />
          <div className="post" /><i className="step" /><div className="base" />
          <div className="beam">
            <div className="bar l" /><div className="bar r" />
            <i className="needle"><i /></i>
            <i className="end l" /><i className="end r" />
            <Pan side="l" value={cur} maxValue={maxValue} label={t('adjustment.artRecorded')} />
            <Pan side="r" value={actual} maxValue={maxValue} label={t('adjustment.artActual')} />
          </div>
          <div className="pivot" />
        </div>
      </div>
    </div>
  )
}
