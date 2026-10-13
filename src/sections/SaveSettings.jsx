import { useState, useEffect } from 'react'
import './saveload.css'
import { t } from '../text.js'
import { folderStatus, chooseFolder } from '../saveStore.js'
import { storeErrorText } from '../saveLogic.js'
import { getSync } from '../driveStore.js'

// 設定 → セーブ：セーブフォルダーを選ぶ。選んだフォルダの名前を出す（鍵は saveStore が IndexedDB に持つ）。
// オートセーブの ON・OFF（config.json）は App が持つ autosave（on / broken / reload / toggle）で切り替える
export default function SaveSettings({ autosave }) {
  const connected = getSync().connected // ドライブにつないでいる間は、セーブ・ロードはドライブを使う（spec-drive.md 13.2）
  const [status, setStatus] = useState(null) // { state, name }。読むまでは null
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    folderStatus().then((s) => { if (alive) setStatus(s) })
    return () => { alive = false }
  }, [])

  const choose = async () => {
    setError('')
    try {
      const name = await chooseFolder()
      if (name !== null) { // 取り消したときは何も変えない
        setStatus(await folderStatus())
        await autosave.reload() // 選んだフォルダの config.json を読む（なければ OFF）
      }
    } catch (e) {
      setError(t('save.chooseFailed', { name: e.name }))
    }
  }

  const grant = async () => {
    setError('')
    try {
      setStatus(await folderStatus({ request: true })) // 許可は、ボタンを押したこの処理の中で求める
      await autosave.reload()
    } catch (e) {
      setError(t('save.chooseFailed', { name: e.name }))
    }
  }

  const toggle = async (on) => {
    setError('')
    setBusy(true)
    try {
      await autosave.toggle(on)
      setStatus(await folderStatus())
    } catch (e) {
      setError(storeErrorText(e.name, e.message)) // 書けなかったとき。ON・OFF は変わらない
      setStatus(await folderStatus().catch(() => status))
    } finally {
      setBusy(false)
    }
  }

  if (status === null) return <section className="save-settings" />
  if (connected && status.state === 'unsupported') return <section className="save-settings"><p className="note">{t('save.driveUsed')}</p></section>
  if (status.state === 'unsupported') return <section className="save-settings"><p className="note">{t('save.unsupported')}</p></section>

  return (
    <section className="save-settings">
      {connected && <p className="note">{t('save.driveUsed')}</p>}
      <div className="row">
        <span>{t('save.folder')}<span className="folder-name">{status.name ?? t('save.noFolder')}</span></span>
        <button type="button" onClick={choose}>{status.name === null ? t('save.choose') : t('save.rechoose')}</button>
      </div>
      {status.state === 'prompt' && (
        <div className="row">
          <span className="note">{t('save.needPermission')}</span>
          <button type="button" onClick={grant}>{t('save.grant')}</button>
        </div>
      )}
      {status.state === 'denied' && <p className="error">{t('save.denied')}</p>}
      <div className="row">
        <label>
          <input type="checkbox" checked={autosave.on} disabled={busy || connected || status.state !== 'granted'} onChange={(e) => toggle(e.target.checked)} /> {t('save.autosave')}
        </label>
        {status.state === 'none' && !connected && <span className="note">{t('save.autosaveNeedFolder')}</span>}
      </div>
      {!connected && <p className="note">{t('save.autosaveNote')}</p>}
      {autosave.broken && status.state === 'granted' && <p className="error">{t('save.configBroken')}</p>}
      {error && <p className="error">{error}</p>}
      <p className="note">{t('save.caution')}</p>
    </section>
  )
}
