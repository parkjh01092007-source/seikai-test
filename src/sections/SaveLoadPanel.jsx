import { useState, useEffect, useRef } from 'react'
import './saveload.css'
import { t } from '../text.js'
import { toHash } from '../route.js'
import { nowLocal } from '../today.js'
import { SLOTS, SAVE_ERRORS, slotView, lastSaveText, validateMemo, buildSaveFile, checkSaveFile, storeErrorText, errName } from '../saveLogic.js'
import { startLogin, manualOp } from '../driveStore.js'
import { slotStore } from '../slotStore.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { usePhone } from '../layout.js'
import { Icon } from './Icon.jsx'

const SETTINGS_HASH = toHash({ entry: 'ledger', tab: 'settings', detailId: null })

// セーブ画面（mode 'save'）とロード画面（mode 'load'）。今の画面の上に重ねて出す（標準の <dialog>。外を押しても閉じない。閉じるのは「閉じる」と Esc。# が変わったら App が閉じる）。
// スロットの読み書きは slotStore（フォルダ・ドライブ）、判定と整形は saveLogic。ここは出すだけ
export default function SaveLoadPanel({ mode, data, loadBlocked = false, onClose, onLoad, onToSettings }) {
  const confirm = useConfirm()
  const store = slotStore({ manual: true })
  const phone = usePhone()
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
    body = (
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
    <dialog ref={dialogRef} className="saveload" onCancel={(e) => { e.preventDefault(); onClose() }}>
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
