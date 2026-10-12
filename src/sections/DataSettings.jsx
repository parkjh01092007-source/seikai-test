import { useState, useRef } from 'react'
import { planEntryPurge } from '../ledgerLogic.js'
import { emptyData } from '../storage.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { lastSaveLine } from './lastSave.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { isSupported } from '../saveStore.js'

// 設定 → データの3つの項目（spec-ui.md 4.1。作業21 で、1つの「データ」の項目から分けた。中身と動きは今までどおり）。
// 書き出し・読み込み（スマホの形だけ。右上の帯の代わり。spec-mobile.md 第4章）、仕訳の一括削除（月か全期間）、全体の初期化。
// 一括削除と初期化は、文字を打たないと実行できない確認画面を出す。確認画面に「最後のセーブ：○○前」と「先にセーブする」ボタンを出す。
// ボタンを押すと、確認画面を「いいえ」で閉じて、セーブ画面を開く（もう一度押し直す）。計算は planEntryPurge（ledgerLogic.js）。画面は結果を出して、update するだけ

// フォルダの読み書きができないブラウザ（スマホなど）では、押しても行き止まりなので出さない（spec-save.md 11章・12章の例外）
const saveFirstButton = (openPanel) => (!isSupported() ? null : <button type="button" onClick={() => openPanel('save')}>{t('save.saveFirst')}</button>)

// 書き出し・読み込み。処理は App の doExport・doImport のまま
export function BackupSettings({ onExport, onImport }) {
  const fileRef = useRef(null)
  return (
    <section>
      <button type="button" onClick={onExport}>{t('app.export')}</button>{' '}
      <button type="button" onClick={() => fileRef.current?.click()}>{t('app.import')}</button>
      <input ref={fileRef} type="file" accept=".json" onChange={onImport} hidden />
    </section>
  )
}

export function PurgeSettings({ data, update, openPanel, autosaveBeforeReplace }) {
  const confirm = useConfirm()
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [all, setAll] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const purge = async () => {
    setMessage('')
    setError('')
    const plan = planEntryPurge(data.entries, all ? null : month)
    if (plan.error) return setError(plan.error)
    if (plan.counts.total === 0) return setMessage(t('dataSettings.nothingToDelete'))
    const { normal, opening, adjustment, total } = plan.counts
    const last = await lastSaveLine()
    const ok = await confirm({
      message: [
        t('dataSettings.purgeHead', { target: all ? t('common.allPeriod') : month, total }),
        t('dataSettings.purgeBreakdown', { normal, opening, adjustment }),
        t('dataSettings.purgeNoteSubs'),
        t('dataSettings.purgeNoteKept'),
        ...(last ? [last] : []),
      ].join('\n'),
      requireText: t('dataSettings.purgeRequire'),
      extra: saveFirstButton(openPanel),
    })
    if (!ok) return
    await autosaveBeforeReplace() // 消す前の状態を、オートセーブへ書く（書けるときだけ。書けなくても進む）
    update({ ...data, entries: plan.kept }, { quiet: true }) // 消した直後のデータは、オートセーブに書かない
    setMessage(t('dataSettings.purged', { total }))
  }

  return (
    <section>
      <p className="note">{t('dataSettings.purgeNote')}</p>
      <div>
        <input type="month" aria-label={t('dataSettings.monthAria')} value={month} disabled={all} onChange={(e) => setMonth(e.target.value)} />{' '}
        <label><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t('common.allPeriod')}</label>{' '}
        <button type="button" onClick={purge}>{t('dataSettings.purgeButton')}</button>
        {error && <span className="error"> {error}</span>}
        {message && <span className="note"> {message}</span>}
      </div>
    </section>
  )
}

export function ResetSettings({ openPanel, replaceData }) {
  const confirm = useConfirm()
  const reset = async () => {
    const last = await lastSaveLine()
    const ok = await confirm({
      message: [
        t('dataSettings.resetConfirmHead'),
        t('dataSettings.resetConfirmNote'),
        ...(last ? [last] : []),
      ].join('\n'),
      requireText: t('dataSettings.resetRequire'),
      extra: saveFirstButton(openPanel),
    })
    if (!ok) return
    replaceData(emptyData())
  }

  return (
    <section>
      <p className="note">{t('dataSettings.resetDesc')}</p>
      <button type="button" onClick={reset}>{t('dataSettings.resetButton')}</button>
    </section>
  )
}
