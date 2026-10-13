import { useState, useEffect } from 'react'
import { t } from '../text.js'
import { folderSlotStore, driveSlotStore } from '../slotStore.js'
import { FOLDER_EVENT } from '../saveStore.js'
import { planCopyToDrive, storeErrorText, errName } from '../saveLogic.js'
import { useConfirm } from './ConfirmDialog.jsx'

// 設定 → データ → Google ドライブの下：セーブフォルダーのファイルを、ドライブへ写す（spec-drive.md 13.4）。
// つないでいて、セーブフォルダーを選んでいるときだけ出す。ドライブの同じ番号のスロットが空のものだけを写す（上書きしない）。フォルダのファイルは消さない。
// 計画は planCopyToDrive（saveLogic.js）。ここは、読む → 確認 → 順に作る → 結果の一覧、を出すだけ
const STATUS = { copied: 'copy.st.copied', exists: 'copy.st.exists', newer: 'copy.st.newer', broken: 'copy.st.broken', notDone: 'copy.st.notDone' }

export default function DriveCopy() {
  const confirm = useConfirm()
  const [folder, setFolder] = useState(null) // { state, name }。読むまでは null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState(null) // { head, lines: [{ file, label, status }] }

  useEffect(() => {
    let alive = true
    const read = () => folderSlotStore.status().then((s) => { if (alive) setFolder(s) }).catch(() => {})
    read()
    window.addEventListener(FOLDER_EVENT, read) // 設定 → セーブで、フォルダを選んだとき
    return () => { alive = false; window.removeEventListener(FOLDER_EVENT, read) }
  }, [])
  if (!folder || folder.state === 'none' || folder.state === 'unsupported') return null

  const run = async () => {
    setBusy(true)
    setError('')
    setReport(null)
    try {
      const st = await folderSlotStore.status({ request: true }) // 許可は、押したこの処理の中で求める
      setFolder(st)
      if (st.state !== 'granted') return setError(storeErrorText('NotAllowedError'))
      const plan = planCopyToDrive(await folderSlotStore.readSlots(), await driveSlotStore.existing())
      const exists = plan.items.filter((i) => i.status === 'exists').length
      if (plan.copy.length === 0) return setReport({ head: t('copy.none'), lines: plan.items })
      const ok = await confirm({ message: [t('copy.confirm', { count: plan.copy.length }), ...(exists > 0 ? [t('copy.confirmExists', { count: exists })] : [])].join('\n') })
      if (!ok) return
      const done = new Set()
      let stopped = null
      for (const { file, text } of plan.copy) {
        try {
          await driveSlotStore.createSlot(file, text) // 作るだけ（update は使わない＝上書きできない）
          done.add(file)
        } catch (e) {
          stopped = storeErrorText(errName(e), e.message)
          break
        }
      }
      const lines = plan.items.map((i) => ({ ...i, status: i.status !== 'copy' ? i.status : done.has(i.file) ? 'copied' : 'notDone' }))
      setReport({ head: stopped === null ? t('copy.done', { count: done.size }) : t('copy.stopped', { count: done.size, reason: stopped }), lines })
    } catch (e) {
      setError(storeErrorText(errName(e), e.message))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="drive-copy">
      <h4 className="sub-title">{t('copy.title')}</h4>
      <p className="note">{t('copy.desc')}</p>
      <div className="row"><button type="button" disabled={busy} onClick={run}>{t('copy.button')}</button></div>
      {error && <p className="error">{error}</p>}
      {report && (
        <>
          <p>{report.head}</p>
          {report.lines.length > 0 && <ul>{report.lines.map((l) => <li key={l.file}>{t('copy.line', { label: l.label, status: t(STATUS[l.status]) })}</li>)}</ul>}
        </>
      )}
    </div>
  )
}
