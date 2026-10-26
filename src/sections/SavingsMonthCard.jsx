import { formatYen, formatMoney } from '../ledgerLogic.js'
import { toneColors } from '../savingsRose.js'
import { t } from '../text.js'

// 貯蓄（群青 PC）の単月の棒グラフの札（見本 E22 の monthCard）。取り分け（科目ごとの積み・鶏頭図と同じ色と模様）・取り崩し（赤の斜線）・目標（青い点線）。
// 縦目盛りは、その月の（取り分け・取り崩し・目標）の最大値（bar.axisMax）。数字は 16px 以上。置き場所は、描く前に選ぶ（点線・目標の字・ほかの棒に重ならない所。
// 選べなければ棒の内側／最初の候補）。文字の幅は見積もり（実測で重なり 0 を確かめるのは、段 4 の flow-overlap.mjs）。ids の gradient・pattern は SavingsRose の defs
const BASE = 176, TOP = 44, UX = 10, UW = 58, DX = 82, DW = 42, RIGHT = 236
const tw = (s, fs = 16) => [...s].reduce((n, ch) => n + (/[0-9]/.test(ch) ? 0.55 : ch === ',' ? 0.28 : ch === ' ' ? 0.3 : 1) * fs, 0)
const R = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 })
const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
const EDGE = { stroke: '#05023A', strokeOpacity: 0.3, strokeWidth: 0.8, strokeLinejoin: 'round' }

// 凡例の見本（HTML の小さな四角）。鶏頭図の扇と同じ色と模様
export function swatchStyle(style) {
  const [i, o] = toneColors(style)
  if (style.tone === 0) return { background: `linear-gradient(90deg, ${i}, ${o})` }
  if (style.tone === 1) return { background: `repeating-linear-gradient(45deg, ${i} 0 3px, ${o} 3px 5px)` }
  return { background: `radial-gradient(circle, #fff 1px, ${o} 1.5px) 0 0 / 5px 5px` }
}

export default function SavingsMonthCard({ bar, accounts, currency, unit, onClose }) {
  const { axisMax: M, up, down, goal } = bar
  const ph = BASE - TOP
  const Y = (v) => BASE - (M > 0 ? (v / M) * ph : 0)
  const yg = goal > 0 ? Y(goal) : null
  const lineR = yg === null ? null : R(4, yg - 2, RIGHT, yg + 2)
  const barRects = [up > 0 ? R(UX, Y(up), UX + UW, BASE) : null, down > 0 ? R(DX, Y(down), DX + DW, BASE) : null].filter(Boolean)
  const placed = []
  const shown = bar.per.map((p, i) => ({ ...p, acc: accounts[i] })).filter((p) => p.up > 0)
  let cum = 0
  const stack = shown.map((p) => { const y1 = Y(cum + p.up), y0 = Y(cum); cum += p.up; return { p, y1, y0 } })
  let goalText = null
  if (yg !== null) {
    const s = `${t('savings.goal')} ${formatYen(goal)}${unit}`, w = tw(s) + 10
    const cands = [yg + 22, yg - 7].map((b) => ({ b, r: R(RIGHT - w, b - 15, RIGHT, b + 4) }))
    const ok = cands.find((c) => !hit(c.r, lineR) && !barRects.some((r) => hit(c.r, r)) && c.r.y0 >= 0 && c.r.y1 <= BASE - 1) ?? cands[0]
    placed.push(ok.r)
    goalText = { s, w, ...ok }
  }
  const numLabel = (v, cx, topY, barH, color) => {
    const s = formatYen(v), w = tw(s) + 6
    const above = R(cx - w / 2, topY - 21, cx + w / 2, topY - 4)
    const inside = R(cx - w / 2, topY + 5, cx + w / 2, topY + 24)
    const own = barRects.find((b) => b.x0 <= cx && cx <= b.x1)
    const fits = (r) => !(lineR && hit(r, lineR)) && !placed.some((q) => hit(r, q)) && !barRects.some((b) => b !== own && hit(r, b))
    if (above.y0 >= 0 && fits(above)) { placed.push(above); return { s, x: cx, y: topY - 7, color } }
    placed.push(inside)
    return { s, x: cx, y: topY + 20, color, bg: inside, ok: barH >= 26 && fits(inside) }
  }
  const numUp = up > 0 ? numLabel(up, UX + UW / 2, Y(up), BASE - Y(up), '#12123A') : null
  const numDown = down > 0 ? numLabel(down, DX + DW / 2, Y(down), BASE - Y(down), '#8F1D1D') : null
  const [y, mm] = bar.month.split('-')
  const fillFor = (a) => `url(#sv-gb-${a.style.tone}-${a.style.shade})`
  const num = (n) => n && (
    <>
      {n.bg && <rect className="nbg" x={n.bg.x0} y={n.bg.y0} width={n.bg.x1 - n.bg.x0} height={n.bg.y1 - n.bg.y0} fill="#F7F7FB" fillOpacity="0.92" />}
      <text className="num" x={n.x} y={n.y} textAnchor="middle" fontSize="16" fill={n.color} fontWeight="500">{n.s}</text>
    </>
  )
  return (
    <div className="g-sv-card">
      <div className="bh"><b>{t('savings.cardTitle', { y, m: Number(mm) })}</b><button type="button" onClick={onClose}>{t('save.close')} ×</button></div>
      <svg viewBox="0 0 240 204" role="img" aria-label={t('savings.cardTitle', { y, m: Number(mm) })}>
        {stack.map(({ p, y1, y0 }) => (
          <g key={p.id}>
            <rect x={UX} y={y1.toFixed(2)} width={UW} height={(y0 - y1).toFixed(2)} fill={fillFor(p.acc)} {...EDGE} />
            {p.acc.style.tone > 0 && <rect x={UX} y={y1.toFixed(2)} width={UW} height={(y0 - y1).toFixed(2)} fill={`url(#sv-p-${p.acc.style.tone})`} />}
          </g>
        ))}
        {down > 0 && <>
          <rect x={DX} y={Y(down).toFixed(2)} width={DW} height={(BASE - Y(down)).toFixed(2)} fill="url(#sv-gb-red)" stroke="#8F1D1D" strokeWidth="1.2" strokeDasharray="4 2.5" />
          <rect x={DX} y={Y(down).toFixed(2)} width={DW} height={(BASE - Y(down)).toFixed(2)} fill="url(#sv-p-red)" fillOpacity="0.85" />
        </>}
        {yg !== null && <line className="goalline" x1="4" x2={RIGHT} y1={yg.toFixed(2)} y2={yg.toFixed(2)} stroke="#2A1BFF" strokeWidth="2.6" strokeDasharray="6 3.5" />}
        {goalText && <>
          <rect className="gbg" x={(goalText.r.x0).toFixed(2)} y={goalText.r.y0.toFixed(2)} width={goalText.w.toFixed(2)} height={(goalText.r.y1 - goalText.r.y0).toFixed(2)} fill="#F7F7FB" fillOpacity="0.95" stroke="#2A1BFF" strokeWidth="1" />
          <text className="gtxt" x={RIGHT - 5} y={goalText.b.toFixed(2)} textAnchor="end" fontSize="16" fill="#2A1BFF" fontWeight="500">{goalText.s}</text>
        </>}
        {num(numUp)}{num(numDown)}
        <line x1="4" x2={RIGHT} y1={BASE} y2={BASE} stroke="#55567A" />
        <text x={UX + UW / 2} y={BASE + 20} textAnchor="middle" fontSize="14" fill="#55567A">{t('savings.in')}</text>
        <text x={DX + DW / 2} y={BASE + 20} textAnchor="middle" fontSize="14" fill="#55567A">{t('savings.out')}</text>
      </svg>
      <ul className="bl">
        {shown.map((p) => <li key={p.id}><i style={swatchStyle(p.acc.style)} /><span className="n user-text">{p.acc.name}</span><b>{formatMoney(p.up, currency)}</b></li>)}
        <li><i className="sum" /><span className="n">{t('savings.sumUp')}</span><b>{formatMoney(up, currency)}</b></li>
        <li><i className="dn" /><span className="n">{t('savings.out')}</span><b className="dn">{formatMoney(down, currency)}</b></li>
        <li><i className="gl" /><span className="n">{t('savings.goal')}</span><b>{goal > 0 ? formatMoney(goal, currency) : t('savings.none')}</b></li>
      </ul>
    </div>
  )
}
