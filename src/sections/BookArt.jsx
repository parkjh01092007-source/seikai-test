import { t } from '../text.js'

// 群青の PC の元帳（科目を選ぶ前）の、右の青い面：帳簿の罫線の柄（区切り16-2a）。面の形・位置は残高調整と同じ（gunjo-pc.css の .g-adj-panel）。読み上げには出さない
const COLS = [0, 30, 58, 78] // 縦線・見出しの位置（％）
const SCRIBBLES = [[120, 40], [164, 26], [208, 52], [296, 34], [340, 46]] // 薄い書き込みの線（上からの位置 px・幅 ％）

export default function BookArt() {
  const heads = [t('common.date'), t('common.memo'), t('common.debit'), t('common.credit')]
  return (
    <div className="g-adj-panel g-book-panel" aria-hidden="true">
      <div className="g-adj-art ruled">
        <div className="sheet">
        <div className="cols">{COLS.map((x, k) => <i key={k} className={k === 0 ? 'd' : ''} style={{ left: `${x}%` }} />)}</div>
        <div className="hd">{heads.map((h, k) => <span key={k} style={{ left: `${COLS[k] + 2}%` }}>{h}</span>)}</div>
        {SCRIBBLES.map(([top, w], k) => <span className="scribble" key={k} style={{ top, width: `${w}%` }} />)}
        </div>
        <div className="bigmoon" />
      </div>
    </div>
  )
}
