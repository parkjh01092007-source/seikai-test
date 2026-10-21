import { useState } from 'react'
import { AccountSelect } from './Entries.jsx'
import { entryAccountOptions, validateEntryPresetInput, newEntryPreset, editEntryPreset, moveEntryPreset, formatMoney } from '../ledgerLogic.js'
import { t } from '../text.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { Icon, IconButton } from './Icon.jsx'

const EMPTY = { name: '', debitId: '', creditId: '', amount: '', memo: '' }

// 作る・直す共用。エラーのときは入力途中の内容を消さない。currentIds は編集フォームだけが渡す（そのプリセットが今使っている科目を選択肢に残す）。
// 群青の PC だけ、欄ごとにラベルを上に付ける（定期支払いの登録欄と同じ作り。g-form）
function PresetForm({ accounts, initial, submitLabel, submitIcon = 'plus', onSubmit, onCancel, currentIds, clearOnSuccess }) {
  const options = entryAccountOptions(accounts, currentIds)
  const gunjoPc = useGunjoPc()
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  const field = (label, control) => (gunjoPc ? <label className="fl"><span className="lab">{label}</span>{control}</label> : control)

  const submit = (e) => {
    e.preventDefault()
    const r = validateEntryPresetInput({ ...f, amountText: f.amount }, accounts, currentIds)
    if (r.error) return setError(r.error)
    setError('')
    onSubmit(r)
    if (clearOnSuccess) setF(EMPTY)
  }

  return (
    <form onSubmit={submit} className={gunjoPc ? 'pset g-form' : 'pset'}>
      {field(t('common.name'), <input placeholder={t('common.name')} aria-label={t('common.name')} value={f.name} onChange={(e) => set('name')(e.target.value)} />)}
      {field(t('common.debit'), <AccountSelect label={t('common.debit')} value={f.debitId} onChange={set('debitId')} options={options} />)}
      {field(t('common.credit'), <AccountSelect label={t('common.credit')} value={f.creditId} onChange={set('creditId')} options={options} />)}
      {field(t('presets.amountOptional'), <input inputMode="numeric" placeholder={t('presets.amountOptional')} aria-label={t('common.amount')} value={f.amount} onChange={(e) => set('amount')(e.target.value)} />)}
      {field(t('common.memo'), <input placeholder={t('common.memo')} aria-label={t('common.memo')} value={f.memo} onChange={(e) => set('memo')(e.target.value)} />)}
      <button className="pset-submit"><Icon name={submitIcon} />{submitLabel}</button>
      {onCancel && <button type="button" onClick={onCancel}><Icon name="close" />{t('entries.sheetClose')}</button>}
      {error && <span className="error">{error}</span>}
    </form>
  )
}

// 設定 → 仕訳 → プリセット：一覧（上下・編集・削除）と、新しく作る欄。保存データは data.entryPresets（v11）。選ぶのは、仕訳の入力欄（Entries.jsx）
export default function PresetSettings({ data, update }) {
  const { accounts, entryPresets, settings } = data
  const confirm = useConfirm()
  const [editingId, setEditingId] = useState(null)
  const save = (next) => update({ ...data, entryPresets: next })
  const nameOf = (id) => accounts.find((a) => a.id === id)
  const remove = async (preset) => {
    if (!(await confirm({ message: t('presets.deleteConfirm', { name: preset.name }) }))) return
    save(entryPresets.filter((p) => p.id !== preset.id))
  }
  return (
    <>
      <p className="note">{t('presets.note')}</p>
      <p className="note">{t('presets.limitNote', { max: 30 })}</p>
      {entryPresets.length === 0 ? <p className="note">{t('presets.none')}</p> : (
        <ol className="presets">
          {entryPresets.map((p, i) => {
            if (editingId === p.id) {
              return (
                <li key={p.id}>
                  <PresetForm
                    accounts={accounts}
                    initial={{ name: p.name, debitId: p.debitId, creditId: p.creditId, amount: p.amount === null ? '' : String(p.amount), memo: p.memo }}
                    currentIds={[p.debitId, p.creditId]}
                    submitLabel={t('common.save')}
                    submitIcon="check"
                    onSubmit={(input) => { save(entryPresets.map((x) => (x.id === p.id ? editEntryPreset(p, input) : x))); setEditingId(null) }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              )
            }
            const label = (id) => { const a = nameOf(id); return a ? (a.active ? a.name : t('presets.nameInactive', { name: a.name })) : '' }
            const line = { debit: label(p.debitId), credit: label(p.creditId), amount: p.amount === null ? t('presets.noAmount') : formatMoney(p.amount, settings.currency), memo: p.memo }
            return (
              <li key={p.id} className="fav-item">
                <span className="name">{p.name}</span>
                <IconButton icon="up" label={t('settings.up')} disabled={i === 0} onClick={() => save(moveEntryPreset(entryPresets, p.id, -1))} />
                <IconButton icon="down" label={t('settings.down')} disabled={i === entryPresets.length - 1} onClick={() => save(moveEntryPreset(entryPresets, p.id, 1))} />
                <IconButton icon="edit" label={t('common.edit')} onClick={() => setEditingId(p.id)} />
                <IconButton icon="trash" label={t('common.delete')} onClick={() => remove(p)} />
                <span className="note pset-line">{t(p.memo === '' ? 'presets.line' : 'presets.lineMemo', line)}</span>
              </li>
            )
          })}
        </ol>
      )}
      <PresetForm accounts={accounts} initial={EMPTY} submitLabel={t('common.add')} onSubmit={(input) => save([...entryPresets, newEntryPreset(input)])} clearOnSuccess />
    </>
  )
}
