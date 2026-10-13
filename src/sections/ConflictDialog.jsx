import { useEffect, useRef, useState } from 'react'
import './confirm.css'
import { t } from '../text.js'
import { versionLabel } from '../pwa.js'

// 食い違いの確認画面（spec-drive.md 4.4）。この端末のデータと、ドライブのデータについて、最後に変えた日時と仕訳の件数を並べて出し、どちらを残すか選ばせる。
// 残さなかった方は消さず、ドライブの控え（別のファイル）に残る。選ぶまで、データは変わらない。「あとで決める」・Esc は、何も変えずに閉じる（帯から開き直せる）。
// kind：食い違いの種類（driveLogic の CONFLICT_KINDS）。describe()：材料（driveSync の describeConflict）。resolve('device' | 'drive')：選ぶ（resolveConflict の結果）。onClose：閉じる。onLogin：ログインへ移る（ログインが切れているとき）
// 選べないボタンがあるときは、その理由を出す（電波がない・ログインが切れた・ドライブのデータが読めない・新しい版）。電波が戻ったとき・画面に戻ったときは、自動で読み直す
// ConfirmDialog と同じ作り（標準の <dialog>。外を押しても閉じない。見た目は confirm.css）
export default function ConflictDialog({ kind, describe, resolve, onClose, onLogin }) {
  const dialogRef = useRef(null)
  const laterRef = useRef(null)
  const [info, setInfo] = useState(null) // 材料。読むまでは null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = () => describe().then((r) => { setInfo(r) })
  useEffect(() => {
    const before = document.activeElement
    dialogRef.current.showModal()
    laterRef.current.focus()
    load()
    const again = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('online', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      window.removeEventListener('online', again)
      document.removeEventListener('visibilitychange', again)
      if (before instanceof HTMLElement && before.isConnected) before.focus()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 開いたときに1回だけ

  const choose = async (choice) => {
    setBusy(true)
    setError('')
    const r = await resolve(choice)
    setBusy(false)
    if (r.kind === 'resolved') return onClose()
    if (r.kind === 'unavailable') setError(t('conflict.unavailable'))
    else if (r.kind === 'conflict') { setError(t('conflict.again')); load() } // 上げ直す間に、また、ほかの端末が変えた
    else setError(t('conflict.error'))
  }

  const titles = { first: t('conflict.titleFirst'), unverified: t('conflict.titleUnverified'), broken: t('conflict.titleBroken') }
  const summary = (s, state) => {
    if (state === 'gone') return <p>{t('conflict.gone')}</p>
    if (state === 'broken') return <p>{t('conflict.unreadable')}</p>
    if (state === 'newer') return <p>{t('conflict.newer')}</p>
    if (!s) return <p>{t('conflict.unreadable')}</p>
    return <><p>{t('conflict.changedAt', { time: (s.changedAt && versionLabel(s.changedAt, null)) || t('conflict.none') })}</p><p>{t('conflict.entries', { count: s.entries })}</p></>
  }
  const canDrive = info && !info.error && info.driveState === 'ok'
  const canDevice = info && !info.error && info.driveState !== 'newer'
  // 選べない理由（押せないボタンがあるとき）。読み込んでいる間は出さない
  const whyNot = !info ? null
    : info.error === 'offline' ? t('conflict.whyOffline')
    : info.error === 'login' ? t('conflict.whyLogin')
    : info.error ? t('conflict.whyFailed')
    : info.driveState === 'newer' ? t('conflict.whyNewer')
    : !canDrive ? t('conflict.whyNoDrive')
    : null

  return (
    <dialog ref={dialogRef} className="confirm conflict" onCancel={(e) => { e.preventDefault(); if (!busy) onClose() }}>
      <p className="message">{titles[kind] ?? t('conflict.title')}</p>
      {info === null && <p>{t('conflict.loading')}</p>}
      {info && !info.error && (
        <div className="sides">
          <section className="side"><h3>{t('conflict.device')}</h3>{summary(info.local, 'ok')}</section>
          <section className="side"><h3>{t('conflict.drive')}</h3>{summary(info.drive, info.driveState)}</section>
        </div>
      )}
      <p className="note-line">{t('conflict.note')}</p>
      {whyNot && <p className="error" role="status">{whyNot}</p>}
      {busy && <p role="status">{t('conflict.working')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        <button type="button" disabled={!canDevice || busy} onClick={() => choose('device')}>{t('conflict.keepDevice')}</button>
        <button type="button" disabled={!canDrive || busy} onClick={() => choose('drive')}>{t('conflict.keepDrive')}</button>
        {info?.error && (info.error === 'login' ? <button type="button" onClick={onLogin}>{t('conflict.login')}</button> : <button type="button" onClick={load}>{t('conflict.retry')}</button>)}
        <button type="button" ref={laterRef} disabled={busy} onClick={onClose}>{t('conflict.later')}</button>
      </div>
    </dialog>
  )
}
