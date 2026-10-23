import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { groupByType } from '../ledgerLogic.js'
import { countByAccount, monthCounts, monthWindow, moonLit, barHeight, yearSpan, MONTHS } from '../bookPicker.js'
import { today } from '../today.js'
import { t } from '../text.js'

// 群青の PC の元帳の選択（区切り16-2b。見本は orenoyome-tools の plan-adjust-book の mock16c/book-initial-*・book-selected-*）。
// 科目を選ぶ前（と「科目を変える」を押したとき）は大きな札：区分のタブ → 科目のボタン → 期間（全期間｜月を選ぶ）と直近12か月の帯。
// 選んだあとは、1行の細い札。選んだものは LedgerBook の accountId・month（保存しない。画面の中の状態だけ）。計算は新しく作らない（件数の数え方は bookPicker.js）
// 科目を選ぶ前の画面を 1 ページに収めるため、科目ボタンは、仕訳のある科目を件数の多い順に並べ、動きのない科目は「動きなし N」の札にたたむ。それでも 2 行を超えるときは「すべて表示」

const ROWS = 2 // 科目ボタンを、たたんだまま見せる行数

// 矢印キーで、同じ群れのボタンの間を動く。follow：動いた先をそのまま選ぶ（タブ・切り替え）。科目と月は、動くだけ（Enter・Space で選ぶ）
function arrowKeys(e, follow) {
  const items = [...e.currentTarget.querySelectorAll('button:not(:disabled)')]
  const i = items.indexOf(document.activeElement)
  if (i < 0) return
  let j
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % items.length
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + items.length - 1) % items.length
  else if (e.key === 'Home') j = 0
  else if (e.key === 'End') j = items.length - 1
  else return
  e.preventDefault()
  items[j].focus()
  if (follow) items[j].click()
}

// 月の満ち欠け（右から満ちる。DriveBusy.jsx の moonPath と同じ式）
function Moon({ f, size }) {
  const c = size / 2
  const r = size / 2 - 1.5
  let lit = null
  if (f > 0.995) lit = <circle className="lit" cx={c} cy={c} r={r} />
  else if (f >= 0.005) {
    const k = (Math.abs(2 * f - 1) * r).toFixed(2)
    lit = <path className="lit" d={`M${c} ${c - r}A${r} ${r} 0 0 1 ${c} ${c + r}A${k} ${r} 0 0 ${f > 0.5 ? 1 : 0} ${c} ${c - r}Z`} />
  }
  return <svg className="lx-moon" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><circle className="ring" cx={c} cy={c} r={r} />{lit}</svg>
}

function Months({ win, counts, month, compact, onPick }) {
  const max = counts ? Math.max(...win.map((m) => counts[m.ym] ?? 0)) : 0
  const at = win.findIndex((m) => m.ym === month)
  const cur = at >= 0 ? at : MONTHS - 1
  return (
    <div className={`lx-months${compact ? ' cp' : ''}${month ? '' : ' off'}`} role="group" aria-label={t('book.pickerMonths')} onKeyDown={(e) => arrowKeys(e, false)}>
      {win.map((m, i) => (
        <button type="button" key={m.ym} className={`lx-m${m.ym === month ? ' on' : ''}`} aria-pressed={m.ym === month} tabIndex={i === cur ? 0 : -1}
          aria-label={t('book.monthLabel', { year: m.year, month: m.month })} onClick={() => onPick(m.ym)}>
          {!compact && <small aria-hidden="true">{i === 0 || m.month === 1 ? m.year : ''}</small>}
          <Moon f={moonLit(i)} size={compact ? 18 : 22} />
          <span aria-hidden="true">{m.month}</span>
          {counts && <i className="tk" aria-hidden="true" style={{ height: barHeight(counts[m.ym] ?? 0, max, compact ? 18 : 26) }} />}
        </button>
      ))}
    </div>
  )
}

// 科目のボタン。仕訳のある科目を件数の多い順に（同じ件数は科目の並び順）、動きのない科目は 1 つの札にたたむ。
// たたんだまま見せるのは ROWS 行まで（列の数は、画面の幅で CSS が決めるので、描いた列の数を読む）。あふれる分は「すべて表示」
function Accounts({ list, counts, accountId, idleOpen, allOpen, onIdle, onAll, onPick }) {
  const grid = useRef(null)
  const [cols, setCols] = useState(4)
  useLayoutEffect(() => {
    const el = grid.current
    const read = () => setCols(Math.max(1, getComputedStyle(el).gridTemplateColumns.split(' ').length))
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const n = (a) => counts.get(a.id) ?? 0
  const busy = list.filter((a) => n(a) > 0).sort((a, b) => n(b) - n(a))
  const idle = list.filter((a) => n(a) === 0)
  const idleShown = idleOpen || busy.length === 0 || idle.some((a) => a.id === accountId)
  const tile = (a) => ({ key: a.id, acct: a })
  const base = busy.map(tile)
  if (idle.length && busy.length) base.push({ key: 'idle', fold: 'idle' })
  const limit = ROWS * cols
  let shown = base
  if (base.length > limit) shown = allOpen ? [...base, { key: 'all', fold: 'all' }] : [...base.slice(0, limit - 1), { key: 'all', fold: 'all' }]
  const items = [...shown, ...(idleShown ? idle.map(tile) : [])]
  const stop = Math.max(0, items.findIndex((it) => it.key === accountId)) // Tab で止まる所：選んでいる科目、なければ先頭
  return (
    <div className="lx-accts" ref={grid} role="group" aria-label={t('common.account')} onKeyDown={(e) => arrowKeys(e, false)}>
      {items.map((it, i) => {
        if (it.fold) {
          const open = it.fold === 'idle' ? idleShown : allOpen
          const label = it.fold === 'idle' ? t('book.idle', { count: idle.length }) : t(allOpen ? 'book.fold' : 'book.showAll')
          return (
            <button type="button" key={it.key} className="lx-acct lx-fold" data-fold={it.fold} aria-expanded={open} tabIndex={i === stop ? 0 : -1} onClick={it.fold === 'idle' ? onIdle : onAll}>
              <span>{label}</span><small aria-hidden="true">{open ? '▴' : '▾'}</small>
            </button>
          )
        }
        const a = it.acct
        const c = n(a)
        return (
          <button type="button" key={a.id} className={`lx-acct${a.id === accountId ? ' on' : ''}${c ? '' : ' zero'}`} aria-pressed={a.id === accountId} tabIndex={i === stop ? 0 : -1} onClick={() => onPick(a.id)}>
            <span>{a.name}{!a.active && t('common.inactive')}</span><small>{c ? t('book.count', { count: c }) : '—'}</small>
          </button>
        )
      })}
    </div>
  )
}

export default function LedgerPicker({ accounts, entries, accountId, month, onAccount, onMonth }) {
  const groups = useMemo(() => groupByType(accounts), [accounts])
  const counts = useMemo(() => countByAccount(entries), [entries])
  const account = accounts.find((a) => a.id === accountId)
  const [tabSel, setTabSel] = useState(null) // 見ている区分（選んだ科目の区分と違うとき）
  const [back, setBack] = useState(0) // 12か月ずつ昔へ送った回数
  const [picking, setPicking] = useState(false) // 選んだあとに「科目を変える」で大きな札を開いている
  const [idleOpen, setIdleOpen] = useState(false) // 「動きなし」を開いている
  const [allOpen, setAllOpen] = useState(false) // 「すべて表示」を開いている
  const focusTo = useRef(null) // 開く・閉じたあとに、キーボードの位置を置く先
  const root = useRef(null)

  useEffect(() => { setTabSel(null); setPicking(false); setIdleOpen(false); setAllOpen(false) }, [accountId])
  useEffect(() => {
    const to = focusTo.current
    focusTo.current = null
    if (to === 'acct') (root.current?.querySelector('.lx-acct[aria-pressed="true"]') ?? root.current?.querySelector('.lx-acct'))?.focus()
    if (to === 'change') root.current?.querySelector('.cp-chg')?.focus()
    if (to === 'idle' || to === 'all') root.current?.querySelector(`[data-fold="${to}"]`)?.focus()
  }, [picking, accountId, idleOpen, allOpen])

  const win = monthWindow(today(), back)
  const monthData = account ? monthCounts(entries, accountId) : null
  const activeType = tabSel ?? account?.type ?? groups[0]?.type
  const group = groups.find((g) => g.type === activeType) ?? groups[0]
  const pick = (id) => { focusTo.current = 'change'; onAccount(id) }

  const seg = (
    <span className="lx-seg" role="radiogroup" aria-label={t('book.period')} onKeyDown={(e) => arrowKeys(e, true)}>
      <button type="button" role="radio" aria-checked={!month} tabIndex={month ? -1 : 0} className={month ? '' : 'on'} onClick={() => onMonth('')}>{t('common.allPeriod')}</button>
      <button type="button" role="radio" aria-checked={!!month} tabIndex={month ? 0 : -1} className={month ? 'on' : ''} onClick={() => { setBack(0); onMonth(month || today().slice(0, 7)) }}>{t('book.periodMonth')}</button>
    </span>
  )
  const prev = <button type="button" aria-label={t('book.yearPrev')} onClick={() => setBack(back + 1)}>‹</button>
  const next = <button type="button" aria-label={t('book.yearNext')} disabled={back === 0} onClick={() => setBack(back - 1)}>›</button>

  if (account && !picking) {
    return (
      <div className="lx wide" ref={root}>
        <section className="lx-card lx-compact">
          <div className="cp-acct">
            <span className="cp-t">{groups.find((g) => g.type === account.type)?.label}</span><span className="cp-sep" aria-hidden="true">›</span><b>{account.name}</b>
            <button type="button" className="cp-chg" onClick={() => { focusTo.current = 'acct'; setPicking(true) }}>{t('book.change')} ▾</button>
          </div>
          <div className="cp-per">{seg}<span className="lx-yr">{prev}<b>{yearSpan(win)}</b>{next}</span><Months win={win} counts={monthData} month={month} compact onPick={onMonth} /></div>
        </section>
      </div>
    )
  }
  return (
    <div className="lx" ref={root}>
      <section className="lx-card" onKeyDown={(e) => { if (e.key === 'Escape' && account) { focusTo.current = 'change'; setPicking(false) } }}>
        <div className="lx-tabs" role="tablist" aria-label={t('book.pickerTypes')} onKeyDown={(e) => arrowKeys(e, true)}>
          {groups.map((g) => (
            <button type="button" role="tab" key={g.type} className={`lx-tab${g.type === group.type ? ' on' : ''}`} aria-selected={g.type === group.type} tabIndex={g.type === group.type ? 0 : -1}
              onClick={() => { setTabSel(g.type); setIdleOpen(false); setAllOpen(false) }}>{g.label}</button>
          ))}
        </div>
        <div className="lx-body">
          <p className="lx-cap">{t('common.account')}<em lang="en">ACCOUNT</em></p>
          <Accounts key={group.type} list={group.accounts} counts={counts} accountId={accountId} idleOpen={idleOpen} allOpen={allOpen} onPick={pick}
            onIdle={() => { focusTo.current = 'idle'; setIdleOpen(!idleOpen) }} onAll={() => { focusTo.current = 'all'; setAllOpen(!allOpen) }} />
        </div>
        <div className="lx-sec">
          <div className="lx-row">
            <p className="lx-cap">{t('book.period')}<em lang="en">PERIOD</em></p>
            {seg}
            <span className="lx-hintnote">{t(month ? 'book.noteMonth' : 'book.noteAll')}</span>
            <b className="lx-ylabel">{yearSpan(win)}</b>
          </div>
          <div className="lx-mrow">{prev}<Months win={win} counts={monthData} month={month} onPick={onMonth} />{next}</div>
        </div>
      </section>
    </div>
  )
}
