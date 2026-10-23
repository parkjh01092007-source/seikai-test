import { useState, useEffect, useRef, useCallback } from 'react'
import './saveload.css'
import { t } from '../text.js'
import { toHash } from '../route.js'
import { nowLocal } from '../today.js'
import { SLOTS, SAVE_ERRORS, DASH, slotView, lastSaveText, validateMemo, buildSaveFile, checkSaveFile, storeErrorText, errName } from '../saveLogic.js'
import { moonFraction, scalePosition, spreadPositions, labelClear, MOON_DAYS } from '../saveMoon.js'
import { startLogin, manualOp } from '../driveStore.js'
import { slotStore } from '../slotStore.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { Icon } from './Icon.jsx'

const SETTINGS_HASH = toHash({ entry: 'ledger', tab: 'settings', detailId: null })

// ---- 群青の PC の「月の暦」（見本：design-ref/gunjo-pc/E-save.html・E-load.html）。形と月の計算は saveMoon.js ----
const SCALE_PX = 930 // 目盛りの長さ（見本の幅）。実際の長さを測れるまでの値
const MOON_PX = 44 // 玉の大きさ。近いセーブは、この間隔までずらして並べる
const MOON_PX_SMALL = 36 // 目盛りが SMALL_BELOW 未満のときの玉の大きさ（窓が狭いと、玉が目盛りからはみ出すため）
const SMALL_BELOW = 900
const MOON_TOP = 6 // 玉の上の位置（選んだ玉は 0＝6px 持ち上げる）
const LABEL_GAP = 4 // 玉の下端から名前までの間（選んだ名前もほかと同じ高さ）
const LABEL_H = 13 // 名前の高さ
const LABEL_EM = 11 // 名前の 1 文字の幅（11px の全角。重なりを調べるときの見込み）
const LABEL_PX = 70 // 名前を出す間隔の目安

// 月の絵。kind：'moon'（明るい部分 fraction）・'new'（日付なし。外枠だけ）・'dotted'（データなし・読めないファイル。点線の円）
function Moon({ kind, fraction = 0, size, label }) {
  const c = size / 2
  const r = c - 1.5
  const f = (n) => Number(n.toFixed(2))
  // 明るい部分は左から。左半分＋右へふくらむ半円（半分より明るい）／左半分から欠ける半円（半分より暗い）
  const lit = kind === 'moon' && fraction > 0 && fraction < 1
    ? `M${f(c)} ${f(c - r)}A${f(r)} ${f(r)} 0 0 0 ${f(c)} ${f(c + r)}A${f(Math.abs(2 * fraction - 1) * r)} ${f(r)} 0 0 ${fraction > 0.5 ? 0 : 1} ${f(c)} ${f(c - r)}Z`
    : null
  return (
    <svg className={`sl-moon ${kind}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      {label && <title>{label}</title>}
      <circle className={`ring${kind === 'moon' && fraction >= 1 ? ' full' : ''}`} cx={c} cy={c} r={r} />
      {lit && <path className="lit" d={lit} />}
    </svg>
  )
}

// セーブ画面（mode 'save'）とロード画面（mode 'load'）。今の画面の上に重ねて出す（標準の <dialog>。外を押しても閉じない。閉じるのは「閉じる」と Esc。# が変わったら App が閉じる）。
// スロットの読み書きは slotStore（フォルダ・ドライブ）、判定と整形は saveLogic。ここは出すだけ
export default function SaveLoadPanel({ mode, data, loadBlocked = false, onClose, onLoad, onToSettings }) {
  const confirm = useConfirm()
  const store = slotStore({ manual: true })
  const phone = usePhone()
  const gunjoPc = useGunjoPc() // 群青の PC のときだけ、月の暦の形（それ以外は今までの一覧）
  const dialogRef = useRef(null)
  const [status, setStatus] = useState(null) // { state, name }。確かめるまでは null
  const [slots, setSlots] = useState(null) // { file, label, kind, view }[]。読むまでは null
  const [now, setNow] = useState(nowLocal)
  const [selected, setSelected] = useState(null) // メモを入力中のスロットの file
  const [memo, setMemo] = useState('')
  const [memoError, setMemoError] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState(null) // 群青の PC：右の詳細に出しているスロットの file（押すまでは null＝初めの選び方）

  const visible = SLOTS.filter((s) => mode === 'load' || s.kind === 'manual') // セーブ画面にオートセーブは出さない

  // スロットを読み直す。読めないファイルは、壊れたものとして出す
  const refresh = async () => {
    const rows = await store.readSlots()
    setSlots(SLOTS.map((s) => {
      const r = rows.find((x) => x.file === s.file)
      const view = r.error ? { status: 'broken', error: SAVE_ERRORS.unreadable, main: [], small: '', savedAt: null } : slotView(r.text)
      return { ...s, view }
    }))
    setNow(nowLocal())
  }

  const open = async (request = false) => {
    setError('')
    try {
      const st = await store.status({ request })
      setStatus(st)
      if (st.state === 'granted') await refresh()
    } catch (e) {
      setError(storeErrorText(errName(e), e.message))
    }
  }

  useEffect(() => {
    dialogRef.current.showModal()
    open()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 書く・消す前に、許可を確かめる（なければ求める。ボタンを押した処理の中なので求められる）。許可されていなければ false
  const ensurePermission = async () => {
    const st = await store.status({ request: true })
    setStatus(st)
    return st.state === 'granted'
  }

  const run = async (action) => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (e) {
      setError(storeErrorText(errName(e), e.message))
      try { await refresh() } catch { /* 一覧は読み直せない。エラーは出してある */ }
    } finally {
      setBusy(false)
    }
  }

  const select = (slot) => {
    setSelected(slot.file)
    setMemo('')
    setMemoError('')
    setMessage('')
  }

  const save = (slot) => run(async () => {
    const m = validateMemo(memo)
    if (m.error) return setMemoError(m.error)
    setMemoError('')
    if (!(await ensurePermission())) return
    if (slot.view.status !== 'empty' && !(await confirm({ message: t('save.overwriteConfirm', { label: slot.label }) }))) return
    await manualOp(async () => {
      const file = buildSaveFile(data, { kind: 'manual', savedAt: nowLocal(), memo: m.memo })
      await store.writeSlot(slot.file, JSON.stringify(file, null, 2))
      await refresh()
    })
    setSelected(null)
    setMessage(t('save.saved', { label: slot.label }))
  })

  // ロード：確認 → ファイルを読み直す（一覧のあとに変わっていても、今の中身で調べる）→ 検証と移行（checkSaveFile）→ App がデータを置き換える。失敗のときは今のデータを変えない
  const load = (slot) => run(async () => {
    if (loadBlocked) return setError(t('save.loadBlocked'))
    if (!(await confirm({ message: `${t('save.loadHead', { label: slot.label })}\n${t('save.loadConfirm')}` }))) return
    if (!(await ensurePermission())) return
    const text = await manualOp(() => store.readSlot(slot.file))
    if (text === null) {
      await manualOp(refresh)
      return setError(t('save.gone'))
    }
    const r = checkSaveFile(text)
    if (r.error) {
      await manualOp(refresh)
      return setError(r.error)
    }
    onLoad(r)
  })

  const remove = (slot) => run(async () => {
    if (!(await confirm({ message: t('save.deleteConfirm', { label: slot.label }) }))) return
    if (!(await ensurePermission())) return
    await manualOp(async () => {
      try {
        await store.deleteSlot(slot.file)
      } catch (e) {
        if (errName(e) !== 'NotFoundError') throw e // もうなければ、削除できたのと同じ
      }
      await refresh()
    })
    if (selected === slot.file) setSelected(null)
    setMessage(t('save.deleted', { label: slot.label }))
  })

  const lastSave = slots ? lastSaveText(slots.map((s) => s.view.savedAt).filter(Boolean), now) : null

  // 群青の PC：右の詳細に出すスロット。初めは、セーブ画面は先頭（ファイル1）、ロード画面は一番新しいセーブ（なければ先頭）
  const newestFile = () => {
    const ok = visible.map((d) => ({ file: d.file, view: slots.find((s) => s.file === d.file).view })).filter((x) => x.view.status === 'ok' && Number.isFinite(Date.parse(x.view.savedAt)))
    return ok.length ? ok.reduce((a, b) => (Date.parse(b.view.savedAt) > Date.parse(a.view.savedAt) ? b : a)).file : visible[0].file
  }
  const [axisW, setAxisW] = useState(SCALE_PX) // 目盛りの実際の長さ（画面の幅で変わる。玉をずらす間隔に使う）
  const axisObserver = useRef(null)
  const axisRef = useCallback((node) => {
    axisObserver.current?.disconnect()
    axisObserver.current = null
    if (!node) return
    const measure = () => setAxisW(node.clientWidth || SCALE_PX)
    measure()
    axisObserver.current = new ResizeObserver(measure)
    axisObserver.current.observe(node)
  }, [])
  const currentFile = () => picked ?? (mode === 'load' ? newestFile() : visible[0].file)
  const pick = (file) => { setPicked(file); setSelected(null); setMemo(''); setMemoError(''); setMessage(''); setError('') }

  // 十字キー：上下で、一覧（空のスロットも含む）の 1 つ上・1 つ下を選ぶ。端では回り込む。文字の入力中は、動かさない（文字の編集が先）
  const onKeys = (e) => {
    if (!gunjoPc || !slots || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.isComposing) return
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
    e.preventDefault()
    const files = visible.map((d) => d.file)
    const from = Math.max(0, files.indexOf(currentFile()))
    const to = files[(from + (e.key === 'ArrowDown' ? 1 : files.length - 1)) % files.length]
    pick(to)
    requestAnimationFrame(() => { // 押している間、選んだ行にフォーカスを移し、見える所へ
      const row = dialogRef.current?.querySelector('.slot-pick[aria-current="true"]')
      row?.focus({ preventScroll: true })
      row?.scrollIntoView({ block: 'nearest' })
    })
  }

  // 十字キーと同じ「選ぶだけ」（保存・ロード・削除はしない）。目盛りの玉・名前を押したとき。選んだ行にフォーカスを移すので、押したあとも十字キーが使える
  const pickFromScale = (file) => {
    pick(file)
    requestAnimationFrame(() => {
      const row = dialogRef.current?.querySelector('.slot-pick[aria-current="true"]')
      row?.focus({ preventScroll: true })
      row?.scrollIntoView({ block: 'nearest' })
    })
  }

  const gunjoBody = () => {
    const rows = visible.map((def) => {
      const slot = slots.find((s) => s.file === def.file)
      const { view } = slot
      const fraction = view.status === 'ok' ? moonFraction(view.savedAt, now) : null
      const rel = fraction !== null ? lastSaveText([view.savedAt], now) : DASH
      const at = view.main.find((c) => c.key === 'savedAt')?.text ?? DASH
      const kind = view.status === 'ok' ? (fraction === null ? 'new' : 'moon') : 'dotted'
      return { slot, view, fraction, rel, kind, line: rel === DASH ? DASH : <><span className="nw">{rel}</span>　<span className="nw">{at}</span></>, free: view.main.find((c) => c.key === 'free')?.text }
    })
    const current = rows.find((r) => r.slot.file === currentFile()) ?? rows[0]
    const { slot, view } = current
    // 目盛り：日付のあるセーブだけ。選んだもの、次に右（新しい）ものから順に、重ならないものだけ名前を出す。ほかは月の上に乗せたとき出す
    // 位置は日付どおり（pos）。近くて玉が重なるものだけ、表示の位置（x）を横にずらす。名前の重なりは、ずらしたあとの位置で見る
    const moonPx = axisW < SMALL_BELOW ? MOON_PX_SMALL : MOON_PX
    const labelTop = MOON_TOP + moonPx + LABEL_GAP
    const dated = rows.filter((r) => r.fraction !== null).map((r) => ({ ...r, pos: scalePosition(r.view.savedAt, now) }))
    const xs = spreadPositions(dated.map((r) => r.pos), moonPx / axisW)
    const marks = dated.map((r, i) => ({ ...r, x: xs[i] }))
    const moonBox = (m) => { const t = m.slot.file === slot.file ? 0 : MOON_TOP; return { l: m.x * axisW - moonPx / 2, r: m.x * axisW + moonPx / 2, t, b: t + moonPx } }
    const labelBox = (m) => { const w = [...m.slot.label].length * LABEL_EM; return { l: m.x * axisW - w / 2, r: m.x * axisW + w / 2, t: labelTop, b: labelTop + LABEL_H } }
    const shown = []
    for (const m of marks.slice().sort((a, b) => (b.slot.file === slot.file) - (a.slot.file === slot.file) || b.pos - a.pos)) {
      if (m.slot.file === slot.file || (shown.every((x) => Math.abs(x.x - m.x) * axisW >= LABEL_PX) && labelClear(labelBox(m), marks.filter((o) => o !== m).map(moonBox)))) shown.push(m)
    }
    // 日付のないスロット（空・壊れ・新しい版・日付なし）は、目盛りの下の「日付なし」の段に並べる（スロットの順）
    const undated = rows.filter((r) => r.fraction === null)
    const detailMain = view.main.filter((c) => c.key !== 'free')
    const unreadable = view.status === 'newer' || view.status === 'broken' // 読めないスロットには、上書きしない（先に削除する）
    return (
      <>
        <div className={`sl-scale${moonPx < MOON_PX ? ' sm' : ''}${undated.length ? ' nd' : ''}`} aria-hidden="true">
          <div className="axis" ref={axisRef}>
            <div className="line" />
            {Array.from({ length: MOON_DAYS + 1 }, (_, k) => <i key={k} className={k % 5 === 0 ? 'long' : ''} style={{ left: `${(k / MOON_DAYS) * 100}%` }} />)}
            {marks.map((m) => (
              <div key={m.slot.file} className={`mark${m.slot.file === slot.file ? ' on' : ''}${shown.includes(m) ? ' named' : ''}${m.x * axisW < 35 ? ' edge' : ''}`} style={{ left: `${m.x * 100}%` }} onClick={() => pickFromScale(m.slot.file)}>
                <Moon kind="moon" fraction={m.fraction} size={moonPx} />
                <span className="name">{m.slot.label}</span>
              </div>
            ))}
          </div>
          <span className="old">{t('save.scaleOld')}</span>
          <span className="today">▼ {t('save.scaleToday')}</span>
          {undated.length > 0 && (
            <div className="nodate">
              <span className="cap">{t('save.scaleNoDate')}</span>
              {undated.map((r, i) => (
                <div key={r.slot.file} className={`it${r.slot.file === slot.file ? ' on' : ''}`} style={{ left: `${82 + i * 32}px` }} onClick={() => pickFromScale(r.slot.file)}>
                  {r.view.status === 'empty' ? <span className="pt" /> : <Moon kind={r.kind} size={20} />}
                  <span className="name">{r.slot.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="sl-cols">
          <ul className="sl-list">
            {rows.map((r) => (
              <li key={r.slot.file}>
                <button type="button" className="slot-pick" aria-current={r.slot.file === slot.file ? 'true' : undefined} onClick={() => pick(r.slot.file)}>
                  <Moon kind={r.kind} fraction={r.fraction ?? 0} size={44} label={r.rel === DASH ? '' : r.rel} />
                  <span className="text">
                    <span className="name">{r.slot.label}</span>
                    <span className={`note${r.kind === 'dotted' && r.view.status !== 'empty' ? ' error' : ''}`}>{r.view.status === 'empty' ? t('save.noData') : r.view.status === 'ok' ? r.line : r.view.error}</span>
                  </span>
                  {r.free && <span className="free">{r.free}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="sl-detail">
            <div className="head-row">
              <Moon kind={current.kind} fraction={current.fraction ?? 0} size={96} label={current.rel === DASH ? '' : current.rel} />
              <div>
                <div className="name">{slot.label}{view.status === 'ok' && <span className="rel">{current.rel}</span>}</div>
                {view.status === 'ok' && <div className="note">{view.small}</div>}
                {view.status === 'empty' && <div className="note">{t('save.noData')}</div>}
              </div>
            </div>
            {(view.status === 'newer' || view.status === 'broken') && <p className="error">{view.error}</p>}
            {error && <p className="error">{error}</p>}
            {view.status === 'ok' && (
              <>
                <div className="lab">{view.main.find((c) => c.key === 'free')?.label}</div>
                <div className="big">{current.free}</div>
                {detailMain.map((c) => <div key={c.key} className="kv"><span>{c.label}</span><span className={c.key === 'memo' ? 'user-text' : ''}>{c.text}</span></div>)}
              </>
            )}
            <div className="actions">
              {mode === 'save' && <button type="button" disabled={busy || unreadable} title={unreadable ? t('save.noOverwrite') : undefined} onClick={() => select(slot)}>{t('save.pick')}</button>}
              {mode === 'load' && view.status !== 'empty' && <button type="button" disabled={busy || view.status !== 'ok' || loadBlocked} onClick={() => load(slot)}>{t('save.doLoad')}</button>}
              {view.status !== 'empty' && <button type="button" disabled={busy} onClick={() => remove(slot)}><Icon name="trash" />{t('save.remove')}</button>}
            </div>
            {mode === 'save' && unreadable && <p className="error">{t('save.noOverwrite')}</p>}
            {mode === 'save' && !unreadable && selected === slot.file && (
              <form onSubmit={(e) => { e.preventDefault(); save(slot) }}>
                {view.status !== 'empty' && <p className="note">{t('save.willOverwrite', { label: slot.label })}</p>}
                <label>{t('save.memo')} <input value={memo} onChange={(e) => setMemo(e.target.value)} autoFocus autoComplete="off" /></label>
                <div className="actions">
                  <button type="submit" disabled={busy}>{t('save.doSave')}</button>
                  <button type="button" onClick={() => setSelected(null)}><Icon name="close" />{t('save.cancel')}</button>
                </div>
                {memoError && <span className="error"> {memoError}</span>}
              </form>
            )}
          </div>
        </div>
      </>
    )
  }

  let body
  if (status === null) {
    body = error ? null : <p className="note">{t('save.loading')}</p>
  } else if (status.state === 'unsupported') {
    body = <p className="note">{t('save.unsupported')} {t('save.unsupportedHint')} <a href={SETTINGS_HASH} onClick={() => { onToSettings('data'); onClose() }}>{t('save.toSettings')}</a></p>
  } else if (status.state === 'offline') {
    body = <p className="error">{t('save.errOffline')}</p>
  } else if (status.state === 'login') {
    body = <p>{t('save.needLogin')} <button type="button" onClick={() => startLogin(null)}>{t('save.login')}</button></p>
  } else if (status.state === 'none') {
    body = <p>{t('save.chooseFirst')} <a href={SETTINGS_HASH} onClick={() => { onToSettings('data'); onClose() }}>{t('save.toSettings')}</a></p>
  } else if (status.state === 'prompt') {
    body = <p>{t('save.needPermission')} <button type="button" onClick={() => open(true)}>{t('save.grant')}</button></p>
  } else if (status.state === 'denied') {
    body = <p className="error">{t('save.denied')}</p>
  } else if (slots) {
    body = gunjoPc ? gunjoBody() : (
      <ul className="slots">
        {visible.map((def) => {
          const slot = slots.find((s) => s.file === def.file)
          const { view } = slot
          return (
            <li key={slot.file} className={`slot ${view.status}`}>
              <h3>{slot.label}</h3>
              {view.status === 'empty' && <p className="nodata">{t('save.noData')}</p>}
              {(view.status === 'newer' || view.status === 'broken') && <p className="error">{view.error}</p>}
              {view.status === 'ok' && (
                <>
                  <dl>
                    {view.main.map((c) => <div key={c.key}><dt>{c.label}</dt><dd>{c.text}</dd></div>)}
                  </dl>
                  <p className="note small">{view.small}</p>
                </>
              )}
              <div className="actions">
                {mode === 'save' && <button type="button" disabled={busy} onClick={() => select(slot)}>{t('save.pick')}</button>}
                {mode === 'load' && <button type="button" disabled={busy || view.status !== 'ok' || loadBlocked} onClick={() => load(slot)}>{t('save.doLoad')}</button>}
                {view.status !== 'empty' && <button type="button" disabled={busy} onClick={() => remove(slot)}><Icon name="trash" />{t('save.remove')}</button>}
              </div>
              {mode === 'save' && selected === slot.file && (
                <form onSubmit={(e) => { e.preventDefault(); save(slot) }}>
                  {view.status !== 'empty' && <p>{t('save.willOverwrite', { label: slot.label })}</p>}
                  <label>{t('save.memo')} <input value={memo} onChange={(e) => setMemo(e.target.value)} autoFocus autoComplete="off" /></label>
                  <button type="submit" disabled={busy}>{t('save.doSave')}</button>
                  <button type="button" onClick={() => setSelected(null)}><Icon name="close" />{t('save.cancel')}</button>
                  {memoError && <span className="error"> {memoError}</span>}
                </form>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <dialog ref={dialogRef} className={`saveload${gunjoPc ? ' g-sl' : ''}`} onKeyDown={onKeys} onCancel={(e) => { e.preventDefault(); onClose() }}>
      <div className="head">
        <h2>{mode === 'save' ? t('save.saveHeading') : t('save.loadHeading')}</h2>
        <button type="button" onClick={onClose}><Icon name="close" />{t('save.close')}</button>
      </div>
      {lastSave !== null && <p className="note">{t('save.lastSaveLine', { value: lastSave })}</p>}
      {mode === 'load' && loadBlocked && <p className="note">{t('save.loadBlocked')}</p>}
      {message && <p className="note">{message}</p>}
      {error && <p className="error">{error}</p>}
      {body}
      {/* スマホの形：長い一覧の一番下にも「閉じる」（spec-mobile.md 第6章） */}
      {phone && <div className="foot"><button type="button" onClick={onClose}><Icon name="close" />{t('save.close')}</button></div>}
    </dialog>
  )
}
