import { useState, useEffect, useCallback } from 'react'
import './saveload.css'
import { t } from '../text.js'
import { versionLabel } from '../pwa.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { CHANGE_EVENT, getSync, manualOp } from '../driveStore.js'

// 設定 → データ → ドライブの控え（spec-drive.md 4.8）：控えの一覧（新しい順）と「この控えに戻す」。
// 一覧と戻す動きは useDriveSync（driveSync.js の listBackupDetails・restoreBackup）。ここは、画面に出すだけ。
// 戻す前に確認画面を出す。食い違い待ちの間は、戻すボタンを押せなくし、理由を出す。読めない・新しい版の控えは、戻せない
const SIDE_LABELS = { device: 'backups.side.device', drive: 'backups.side.drive', before: 'backups.side.before' }
// 戻すと、画面全体が作り直される（読み込みと同じ）ので、この部品も作り直される。「戻しました」の知らせは、戻す前にここへ預け、作り直された部品が受け取る
let carried = null

export default function DriveBackups({ driveSync }) {
  const confirm = useConfirm()
  const [, redraw] = useState(0)
  const [list, setList] = useState(null) // null：読み込み中／未接続。配列：控え
  const [message, setMessage] = useState(() => { const m = carried ?? { text: '', error: false }; carried = null; return m })
  const [busy, setBusy] = useState(false)
  const sync = getSync()

  useEffect(() => {
    const on = () => redraw((n) => n + 1)
    window.addEventListener(CHANGE_EVENT, on)
    return () => window.removeEventListener(CHANGE_EVENT, on)
  }, [])

  const load = useCallback(async () => {
    setList(null)
    const r = await driveSync.listBackups()
    setList(Array.isArray(r) ? r : [])
    if (!Array.isArray(r)) setMessage({ text: t('backups.error'), error: true })
  }, [driveSync])
  // つないでいるときだけ、開いたときに読む。つないだ・切ったときも、読み直す
  useEffect(() => {
    if (!sync.connected) { setList(null); return }
    load().catch(() => { setList([]); setMessage({ text: t('backups.error'), error: true }) })
  }, [sync.connected]) // eslint-disable-line react-hooks/exhaustive-deps -- つないだ・切ったときだけ

  const restore = async (item) => {
    setMessage({ text: '', error: false })
    const ok = await confirm({ message: t('backups.confirm', { time: versionLabel(item.at, null) ?? item.at, side: t(SIDE_LABELS[item.side]) }) })
    if (!ok) return
    setBusy(true)
    carried = { text: t('backups.restored'), error: false }
    const r = await manualOp(() => driveSync.restore(item.id))
    setBusy(false)
    if (r.kind === 'restored') { setMessage({ text: t('backups.restored'), error: false }); setTimeout(() => { carried = null }, 1000) } // 画面の作り直しは、この処理のあとに起きる（再描画が遅れる）ので、預けた知らせは、すぐには消さない
    else { carried = null; setMessage({ text: t({ blocked: 'backups.blocked', gone: 'backups.gone', unavailable: 'backups.unavailable' }[r.kind] ?? 'backups.error'), error: true }) }
    load().catch(() => {})
  }

  const summary = (item) => {
    if (item.state === 'newer') return <span className="note">{t('backups.newer')}</span>
    if (!item.summary) return <span className="note">{t('backups.unreadable')}</span>
    return <span className="note">{t('backups.entries', { count: item.summary.entries })}</span>
  }

  return (
    <section className="save-settings">
      <p className="note">{t('backups.desc')}</p>
      {!sync.connected ? <p className="note">{t('backups.needConnect')}</p> : (
        <>
          {sync.conflict && <p className="error" role="status">{t('backups.blocked')}</p>}
          {list === null && <p className="note">{t('backups.loading')}</p>}
          {list && list.length === 0 && <p className="note">{t('backups.empty')}</p>}
          {list && list.length > 0 && (
            <ul className="backup-list">
              {list.map((item) => (
                <li key={item.id}>
                  <span className="backup-main">{versionLabel(item.at, null) ?? item.at}　{t(SIDE_LABELS[item.side])}</span>
                  <span className="backup-sub">
                    {summary(item)}
                    <button type="button" disabled={busy || item.state !== 'ok' || Boolean(sync.conflict)} onClick={() => restore(item)}>{t('backups.restore')}</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="row"><button type="button" disabled={busy || list === null} onClick={() => load().catch(() => {})}>{t('backups.reload')}</button></div>
        </>
      )}
      {message.text && <p className={message.error ? 'error' : 'note'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    </section>
  )
}
