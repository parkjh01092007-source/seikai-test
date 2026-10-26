import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './flow.css'
import { formatMoney } from '../ledgerLogic.js'
import { roseAccounts, roseMonths, roseModel, roseIdle, roseBar, labelSide, accountStyle, toneColors } from '../savingsRose.js'
import { t } from '../text.js'
import SavingsMonthCard, { swatchStyle } from './SavingsMonthCard.jsx'
import SavingsPeriod from './SavingsPeriod.jsx'

// 貯蓄（群青 PC）の右の青い面：鶏頭図（見本 E22-savings-rose）＋単月の棒グラフ。形の計算は savingsRose.js（roseModel）。文字は辞書（savings.rose*）。
// 面の枠は .g-side-panel（gunjo-pc.css。.is-live で操作を受ける）。扇の上にマウス（またはフォーカス）で、その月を強調して棒グラフを出す。クリックで固定（もう一度・「閉じる」・Esc で外す）。
// 状態（終わりの月・取り崩しを引く・固定した月）は画面の中だけ。保存しない
const W = 440, C = 220, PLATE = 206, H = 34, RB = 150
const WIDE = 516 // これ以上の幅の入れ物では、棒グラフの場所を右に空けておく（円盤の最小 270px＋札 232px＋間 14px。gunjo-pc.css の @container g-rose と同じ数字）。狭いときは、固定したときだけ円盤を縮めて下に
const MIN_LABEL_SCALE = 0.55 // 円盤の見かけの縮尺がこれ未満のときは、目標額の字を出さない（棒グラフの札の目標だけ）
const f1 = (n) => n.toFixed(2)
const pt = (r, deg) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)]
const wedge = (rA, rB, a0, a1) => { const [x1, y1] = pt(rA, a0), [x2, y2] = pt(rB, a0), [x3, y3] = pt(rB, a1), [x4, y4] = pt(rA, a1); return `M${f1(x1)},${f1(y1)}L${f1(x2)},${f1(y2)}A${f1(rB)},${f1(rB)} 0 0 1 ${f1(x3)},${f1(y3)}L${f1(x4)},${f1(y4)}A${f1(rA)},${f1(rA)} 0 0 0 ${f1(x1)},${f1(y1)}Z` }
const arc = (r, a0, a1) => { const [x2, y2] = pt(r, a0), [x3, y3] = pt(r, a1); return `M${f1(x2)},${f1(y2)}A${f1(r)},${f1(r)} 0 0 1 ${f1(x3)},${f1(y3)}` }
const EDGE = { stroke: '#05023A', strokeOpacity: 0.3, strokeWidth: 0.8, strokeLinejoin: 'round' }
const roseAngle = (i) => -90 + i * 30 + 15 // 扇の真ん中の角度（flowArt.js の roseSpan の中点）

const Rim = ({ r, a0, a1 }) => <path d={arc(r, a0, a1)} fill="none" stroke="#fff" strokeOpacity="0.75" strokeWidth="1.3" />
// 取り分けの扇（科目の色と模様）。tone 1＝斜めの細い線、2＝点
function Seg({ fill, tone, r0, r1, a0, a1 }) {
  const d = wedge(r0, r1, a0, a1)
  return <><path d={d} fill={fill} {...EDGE} />{tone > 0 && <path d={d} fill={`url(#sv-p-${tone})`} />}<Rim r={r1} a0={a0} a1={a1} /></>
}
// 取り崩しの扇（赤の斜線＋点線の縁）
function RedSeg({ r0, r1, a0, a1 }) {
  const d = wedge(r0, r1, a0, a1)
  return <><path d={d} fill="url(#sv-g-red)" fillOpacity="0.9" /><path d={d} fill="url(#sv-p-red)" fillOpacity="0.9" /><path d={d} fill="none" stroke="#8F1D1D" strokeWidth="1.6" strokeDasharray="4 2.5" /><Rim r={r1} a0={a0} a1={a1} /></>
}
const GoalArc = ({ r, a0, a1 }) => <path d={arc(r, a0 + 1.2, a1 - 1.2)} fill="none" stroke="#2A1BFF" strokeWidth="3" strokeDasharray="5 3" />

// 扇・棒の色（科目ごとの色と濃さ）と模様。SavingsMonthCard の棒も、同じ id を使う
function Defs({ styles }) {
  const grad = (id, i, o) => (
    <>
      <radialGradient id={`sv-g-${id}`} gradientUnits="userSpaceOnUse" cx={C} cy={C} r="200"><stop offset="0.12" stopColor={i} /><stop offset="1" stopColor={o} /></radialGradient>
      <linearGradient id={`sv-gb-${id}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={i} /><stop offset="1" stopColor={o} /></linearGradient>
    </>
  )
  const used = [...new Map(styles.map((s) => [`${s.tone}-${s.shade}`, s])).values()]
  return (
    <defs>
      {used.map((s) => { const [i, o] = toneColors(s); return <g key={`${s.tone}-${s.shade}`}>{grad(`${s.tone}-${s.shade}`, i, o)}</g> })}
      {grad('net', '#0E6B3A', '#4ADE9B')}{grad('red', '#8F1D1D', '#F0524F')}
      <pattern id="sv-p-1" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#fff" strokeOpacity="0.34" strokeWidth="1.2" /></pattern>
      <pattern id="sv-p-2" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.15" fill="#fff" fillOpacity="0.5" /></pattern>
      <pattern id="sv-p-red" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" /></pattern>
      <radialGradient id="sv-g-plate" gradientUnits="userSpaceOnUse" cx={C} cy={C} r={PLATE}><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#E9E8F6" /></radialGradient>
    </defs>
  )
}

// ホバー・固定した月の目標額の字。円盤の見かけの縮尺 k に関わらず、画面で 16px。基準の円（RB）より外の帯に、上半分の月は上・下半分は下。薄い地つき
function GoalLabel({ i, text, k, onRect }) {
  const ref = useRef(null)
  const [bw, setBw] = useState(0)
  const fs = 16 / k
  useLayoutEffect(() => { setBw(ref.current.getBBox().width) }, [text, fs])
  const mid = (roseAngle(i) * Math.PI) / 180
  const w = bw + fs * 0.8, h = fs * 1.45
  const cy = C + (labelSide(i) === 'top' ? -1 : 1) * (RB + 8 + h / 2)
  const dy = Math.abs(cy - C) + h / 2
  const chord = Math.sqrt(Math.max(0, PLATE * PLATE - dy * dy))
  const lo = C - chord + w / 2, hi = C + chord - w / 2
  const cx = lo <= hi ? Math.min(hi, Math.max(lo, C + (RB + 8) * Math.cos(mid))) : C
  const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2
  useLayoutEffect(() => { onRect({ x0, y0, x1, y1 }); return () => onRect(null) }, [x0, y0, x1, y1]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <g className="glabel" pointerEvents="none">
      <rect x={f1(cx - w / 2)} y={f1(cy - h / 2)} width={f1(w)} height={f1(h)} fill="#fff" fillOpacity="0.95" stroke="#2A1BFF" strokeWidth="1.5" />
      <text ref={ref} x={f1(cx)} y={f1(cy + fs * 0.35)} textAnchor="middle" fontSize={fs} fill="#12123A" fontWeight="500">{text}</text>
    </g>
  )
}

// 記録が無いとき（案 A）：薄い輪郭だけの鶏頭図（12 か月の数字・中央の穴・細い点線の仕切り）。扇・ボタン・凡例は出さない。押せず、読み上げにも出さない（一文が、次の行動を言う）
function GhostRose({ svgRef, rows, k, endLabel }) {
  return (
    <svg ref={svgRef} className="g-rose is-ghost" viewBox={`0 0 ${W} ${W}`} aria-hidden="true">
      <Defs styles={[]} />
      <circle cx={C + 7} cy={C + 7} r={PLATE} fill="#05023A" opacity="0.3" />
      <circle cx={C} cy={C} r={PLATE} fill="url(#sv-g-plate)" opacity="0.6" />
      {rows.map((r, i) => {
        const a = -90 + i * 30
        const [x1, y1] = pt(H, a), [x2, y2] = pt(PLATE - 28, a)
        const [nx, ny] = pt(PLATE - 15, roseAngle(i))
        return (
          <g key={r.month}>
            <line x1={f1(x1)} y1={f1(y1)} x2={f1(x2)} y2={f1(y2)} stroke="#8A8BB8" strokeWidth="1" strokeDasharray="3 4" />
            <text className="rimnum" x={f1(nx)} y={f1(ny + 4)} textAnchor="middle" fontSize={Math.max(11, 12 / k)} fill="#55567A">{Number(r.month.slice(5))}</text>
          </g>
        )
      })}
      <circle cx={C} cy={C} r={H - 1} fill="#fff" opacity="0.9" />
      <text x={C} y={C - 3} textAnchor="middle" fontSize="12" fill="#55567A">{t('savings.centerEnd')}</text>
      <text x={C} y={C + 13} textAnchor="middle" fontSize="13" fill="#12123A" fontWeight="500">{endLabel}</text>
    </svg>
  )
}

export default function SavingsRose({ accounts, entries, budgets, today, first, currency, unit, noAccounts = false }) {
  const [end, setEnd] = useState(today.slice(0, 7))
  const [net, setNet] = useState(false)
  const [hov, setHov] = useState(null)
  const [pin, setPin] = useState(null)
  const [dlg, setDlg] = useState(false)
  const [tab, setTab] = useState(11)
  const [k, setK] = useState(1)
  const [wide, setWide] = useState(false)
  const [labelRect, setLabelRect] = useState(null) // 目標額の字の枠。縁の月の数字のうち、字の下になるものは隠す（字が読めるように）
  const [hid, setHid] = useState(() => new Set())
  const numRefs = useRef([])
  const svgRef = useRef(null), wrapRef = useRef(null), perRef = useRef(null), fans = useRef([])
  const empty = first === null
  const accs = useMemo(() => roseAccounts(accounts, entries).map((a, i) => ({ id: a.id, name: a.name, style: accountStyle(i) })), [accounts, entries])
  const rows = useMemo(() => roseMonths({ accounts, entries, budgets, end }), [accounts, entries, budgets, end])
  const model = useMemo(() => roseModel(rows, net ? 'net' : 'stack', H, RB), [rows, net])
  const idle = roseIdle(rows)
  const styleOf = Object.fromEntries(accs.map((a) => [a.id, a.style]))
  const cur = hov ?? pin
  const shown = wide ? cur : pin

  // 円盤の見かけの縮尺（目標額の字を画面で 16px にする）と、入れ物の幅（棒グラフの場所を空けるか）
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      if (svgRef.current) setK(Math.round((svgRef.current.getBoundingClientRect().width / W) * 100) / 100)
      if (wrapRef.current) setWide(wrapRef.current.getBoundingClientRect().width >= WIDE)
    })
    ;[svgRef, wrapRef].forEach((r) => r.current && ro.observe(r.current))
    return () => ro.disconnect()
  }, [empty])
  useLayoutEffect(() => {
    if (!labelRect) { setHid((h) => (h.size ? new Set() : h)); return }
    const s = new Set()
    numRefs.current.forEach((el, i) => {
      if (!el) return
      const b = el.getBBox()
      if (b.x < labelRect.x1 && labelRect.x0 < b.x + b.width && b.y < labelRect.y1 && labelRect.y0 < b.y + b.height) s.add(i)
    })
    setHid(s)
  }, [labelRect, k, end])
  useEffect(() => {
    if (pin === null || dlg) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setPin(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pin, dlg])

  const pick = (m) => { setEnd(m); setPin(null); setHov(null); setDlg(false); perRef.current?.focus() }
  const closeDlg = () => { setDlg(false); perRef.current?.focus() }
  const move = (i) => { fans.current[(i + 12) % 12]?.focus() }
  const onFanKey = (e, i) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPin(pin === i ? null : i) }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i + 1) }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i - 1) }
    else if (e.key === 'Home') { e.preventDefault(); move(0) }
    else if (e.key === 'End') { e.preventDefault(); move(11) }
  }
  const money = (n) => formatMoney(n, currency)
  const [ey, em] = end.split('-')
  const m = (i) => Number(rows[i].month.slice(5))
  const labelText = cur === null || k < MIN_LABEL_SCALE ? null
    : rows[cur].goalSum > 0 ? t('savings.labelGoal', { m: m(cur), amount: money(rows[cur].goalSum) }) : t('savings.labelNoGoal', { m: m(cur) })

  return (
    <div className="g-side-panel is-live">
      <div className="g-side-stick">
        <div className="g-side-art" aria-hidden="true" />
        <div className="g-side-pin">
          <div className="g-side-cap">{t('savings.roseTitle')}<small lang="en">{t('savings.roseTitleEn')}</small></div>
          {empty ? (
            <>
              <GhostRose svgRef={svgRef} rows={rows} k={k} endLabel={`${ey}/${Number(em)}`} />
              <p className="g-rose-hint">{t(noAccounts ? 'savings.roseNoAccountsHint' : 'savings.roseEmptyHint')}</p>
            </>
          ) : (
            <div ref={wrapRef} className="g-rose-wrap">
              <div className={`g-rose-grid${shown !== null ? ' show' : ''}`}>
              <div className="g-rose-main">
                <div className="g-rose-ctl">
                  <button type="button" aria-pressed={net} onClick={() => setNet(!net)}><span className="sq" aria-hidden="true" />{t('savings.netButton')}</button>
                  <button type="button" ref={perRef} aria-haspopup="dialog" aria-expanded={dlg} onClick={() => setDlg(true)}>{t('savings.periodButton')} ▾</button>
                </div>
                <svg ref={svgRef} className="g-rose" viewBox={`0 0 ${W} ${W}`} role="group" aria-label={t('savings.roseAria')} aria-description={t('savings.pinHint')}>
                  <Defs styles={accs.map((a) => a.style)} />
                  <circle cx={C + 7} cy={C + 7} r={PLATE} fill="#05023A" />
                  <circle cx={C} cy={C} r={PLATE} fill="url(#sv-g-plate)" />
                  {rows.map((r, i) => {
                    const [x, y] = pt(PLATE - 15, roseAngle(i)) // 縁の月の数字（1〜12）。画面で 12px 前後
                    return <text key={r.month} ref={(el) => { numRefs.current[i] = el }} visibility={hid.has(i) ? 'hidden' : 'visible'} className="rimnum" x={f1(x)} y={f1(y + 4)} textAnchor="middle" fontSize={Math.max(11, 12 / k)} fill="#55567A">{m(i)}</text>
                  })}
                  <g key={`${end}-${net}`}>
                    {model.items.map((it, i) => {
                      const [a0, a1] = it.span
                      const row = rows[i]
                      const mid = (a0 + a1) / 2
                      const [tx, ty] = pt(PLATE + 3, mid), [bx1, by1] = pt(PLATE + 16, mid - 3.4), [bx2, by2] = pt(PLATE + 16, mid + 3.4)
                      const none = row.up === 0 && row.down === 0
                      const [dx, dy] = pt(H + 8, mid)
                      return (
                        <g
                          key={row.month}
                          ref={(el) => { fans.current[i] = el }}
                          className={`wd${cur === i ? ' cur' : ''}`}
                          tabIndex={i === tab ? 0 : -1}
                          role="button"
                          aria-pressed={pin === i}
                          aria-label={net ? t('savings.fanAriaNet', { m: m(i), net: money(row.net) }) : t('savings.fanAria', { m: m(i), up: money(row.up), down: money(row.down) })}
                          onMouseEnter={() => setHov(i)}
                          onMouseLeave={() => setHov(null)}
                          onFocus={() => { setHov(i); setTab(i) }}
                          onBlur={() => setHov(null)}
                          onClick={() => setPin(pin === i ? null : i)}
                          onKeyDown={(e) => onFanKey(e, i)}
                        >
                          <path className="hit" d={wedge(H, PLATE, a0, a1)} fill="transparent" />
                          {none ? <circle cx={f1(dx)} cy={f1(dy)} r="2.5" fill="#55567A" /> : (
                            <g className={`gr${i === 11 ? ' now' : ''}`} style={{ '--i': i }}>
                              {net ? (it.net && (it.net.kind === 'plus'
                                ? <Seg fill="url(#sv-g-net)" tone={0} r0={it.net.r0} r1={it.net.r1} a0={a0} a1={a1} />
                                : <RedSeg r0={it.net.r0} r1={it.net.r1} a0={a0} a1={a1} />)) : (
                                <>
                                  {it.segs.map((s) => { const st = styleOf[s.id]; return s.r1 > s.r0 + 0.01 && <Seg key={s.id} fill={`url(#sv-g-${st.tone}-${st.shade})`} tone={st.tone} r0={s.r0} r1={s.r1} a0={a0} a1={a1} /> })}
                                  {it.down && <RedSeg r0={it.down.r0} r1={it.down.r1} a0={a0} a1={a1} />}
                                </>
                              )}
                            </g>
                          )}
                          {it.goalR !== null && <GoalArc r={it.goalR} a0={a0} a1={a1} />}
                          <path className="hlw" d={wedge(H, PLATE, a0, a1)} fill="none" stroke="#2A1BFF" strokeWidth="3" strokeLinejoin="round" />
                          {i === 11 && <path d={`M${f1(tx)},${f1(ty)}L${f1(bx1)},${f1(by1)}L${f1(bx2)},${f1(by2)}Z`} fill="#fff" />}
                        </g>
                      )
                    })}
                  </g>
                  <circle cx={C} cy={C} r={H - 1} fill="#fff" />
                  <text x={C} y={C - 3} textAnchor="middle" fontSize="12" fill="#55567A">{t('savings.centerEnd')}</text>
                  <text x={C} y={C + 13} textAnchor="middle" fontSize="13" fill="#12123A" fontWeight="500">{ey}/{Number(em)}</text>
                  {labelText && <GoalLabel i={cur} text={labelText} k={k} onRect={setLabelRect} />}
                </svg>
                {idle && <p className="g-rose-idle">{t('savings.roseNoActivity')}</p>}
                <ul className="g-rose-leg">
                  {accs.map((a) => <li key={a.id}><i style={swatchStyle(a.style)} /><span className="user-text">{a.name}</span></li>)}
                  <li><i className="dn" />{t('savings.out')}</li>
                  <li><i className="gl" />{t('savings.legendGoal')}</li>
                </ul>
              </div>
              <div className="g-rose-side">
                {shown !== null && <SavingsMonthCard bar={roseBar(rows[shown])} accounts={accs} currency={currency} unit={unit} onClose={() => { setPin(null); setHov(null) }} />}
              </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {dlg && <SavingsPeriod end={end} today={today} first={first} onPick={pick} onClose={closeDlg} />}
    </div>
  )
}
