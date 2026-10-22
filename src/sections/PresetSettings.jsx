import { useState, useRef } from 'react'
import { AccountSelect } from './Entries.jsx'
import {
  entryAccountOptions, validateEntryPresetInput, newEntryPreset, editEntryPreset, moveEntryPreset, canAddEntryPreset, presetSummary, formatMoney, ENTRY_PRESET_NAME_MAX, ENTRY_PRESET_MAX,
} from '../ledgerLogic.js'
import { PRESET_ICON_PICKER, PRESET_ICON_LABELS, presetIconId } from '../icons.js'
import { t } from '../text.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { Icon, IconButton } from './Icon.jsx'

const EMPTY = { name: '', icon: PRESET_ICON_PICKER[0], debitId: '', creditId: '', amount: '', memo: '' }

// 記号の選択（radiogroup。矢印で移動）。used：ほかのプリセットが使っている記号（小さい点を出す。選べはする）。選んだものは反転
function IconPicker({ value, onChange, used }) {
  const ref = useRef(null)
  const ids = PRESET_ICON_PICKER
  const tab = ids.includes(value) ? value : ids[0] // 選択肢にない記号（初めの記号）のときは、先頭に Tab を置く
  const onKey = (e) => {
    const i = ids.indexOf(document.activeElement?.dataset.icon)
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (step === undefined || i < 0) return
    e.preventDefault()
    const next = ids[(i + step + ids.length) % ids.length]
    onChange(next)
    ref.current?.querySelector(`[data-icon="${next}"]`)?.focus()
  }
  return (
    <div className="pset-icons" role="radiogroup" aria-label={t('presets.pickIcon')} ref={ref} onKeyDown={onKey}>
      {ids.map((id) => {
        const on = id === value
        const dup = used.has(id)
        const label = dup ? t('presets.iconLabelUsed', { label: t(PRESET_ICON_LABELS[id]) }) : t(PRESET_ICON_LABELS[id])
        return (
          <span key={id} className="pset-icon-cell">{/* span で包む：群青の PC の「隣り合う部品は余白で 12px」規則に、格子を巻き込まないため（間は格子の gap） */}
          <button type="button" role="radio" aria-checked={on} data-icon={id} tabIndex={id === tab ? 0 : -1}
            className={`icon-only pset-icon-opt${on ? ' on' : ''}${dup ? ' used' : ''}`}
            aria-label={label} title={label} onClick={() => onChange(id)}>
            <Icon name={id} />{dup && <i className="pset-dot" aria-hidden="true" />}
          </button>
          </span>
        )
      })}
    </div>
  )
}

// 作る・直す共用。エラーのときは入力途中の内容を消さない。currentIds は編集フォームだけが渡す（そのプリセットが今使っている科目を選択肢に残す）。
// 群青の PC だけ、欄ごとにラベルを上に付ける（定期支払いの登録欄と同じ作り。g-form）。名前は空でもよい。used は、ほかのプリセットが使っている記号
function PresetForm({ accounts, initial, submitLabel, submitIcon = 'plus', onSubmit, onCancel, currentIds, clearOnSuccess, used, beforeSubmit }) {
  const options = entryAccountOptions(accounts, currentIds)
  const gunjoPc = useGunjoPc()
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  const field = (label, control) => (gunjoPc ? <label className="fl"><span className="lab">{label}</span>{control}</label> : control)

  const submit = (e) => {
    e.preventDefault()
    const stop = beforeSubmit?.() // 20 件のとき、追加を止めて理由を出す
    if (stop?.error) return setError(stop.error)
    const r = validateEntryPresetInput({ ...f, amountText: f.amount }, accounts, currentIds)
    if (r.error) return setError(r.error)
    setError('')
    onSubmit(r)
    if (clearOnSuccess) setF(EMPTY)
  }

  return (
    <form onSubmit={submit} className={gunjoPc ? 'pset g-form' : 'pset'}>
      <div className="pset-pick-row">
        {gunjoPc && <span className="lab">{t('presets.pickIcon')}</span>}
        <IconPicker value={f.icon} onChange={set('icon')} used={used} />
        {!PRESET_ICON_PICKER.includes(f.icon) && <span className="note">{t('presets.iconKept')}</span>}
      </div>
      {field(t('presets.namePlaceholder'), <input placeholder={t('presets.namePlaceholder')} aria-label={t('common.name')} value={f.name} onChange={(e) => set('name')(e.target.value)} />)}
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

// 設定 → 仕訳 → プリセット：一覧（記号・名前〔なければ要約〕・上下・編集・削除）と、新しく作る欄（記号を選ぶ）。保存データは data.entryPresets（v11）。選ぶのは、仕訳の入力欄（Entries.jsx）
export default function PresetSettings({ data, update }) {
  const { accounts, entryPresets, settings } = data
  const confirm = useConfirm()
  const [editingId, setEditingId] = useState(null)
  const save = (next) => update({ ...data, entryPresets: next })
  const nameOf = (id) => accounts.find((a) => a.id === id)
  const usedBy = (exceptId) => new Set(entryPresets.filter((p) => p.id !== exceptId).map((p) => presetIconId(p.icon)))
  const remove = async (preset) => {
    if (!(await confirm({ message: t('presets.deleteConfirm', { name: presetSummary(preset, accounts, settings.currency) }) }))) return
    save(entryPresets.filter((p) => p.id !== preset.id))
  }
  const full = !canAddEntryPreset(entryPresets).ok
  return (
    <>
      <p className="note">{t('presets.note')}</p>
      <p className="note">{t('presets.limitNote', { max: ENTRY_PRESET_NAME_MAX, count: ENTRY_PRESET_MAX })}</p>
      {entryPresets.length === 0 ? <p className="note">{t('presets.none')}</p> : (
        <ol className="presets">
          {entryPresets.map((p, i) => {
            if (editingId === p.id) {
              return (
                <li key={p.id}>
                  <PresetForm
                    accounts={accounts}
                    initial={{ name: p.name, icon: presetIconId(p.icon), debitId: p.debitId, creditId: p.creditId, amount: p.amount === null ? '' : String(p.amount), memo: p.memo }}
                    currentIds={[p.debitId, p.creditId]}
                    used={usedBy(p.id)}
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
                <span className="pset-sym"><Icon name={presetIconId(p.icon)} /></span>
                <span className="name">{p.name.trim() !== '' ? p.name : <span className="note">{t('presets.noName')}</span>}</span>
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
      {full && <p className="note pset-full">{canAddEntryPreset(entryPresets).error}</p>}
      <PresetForm accounts={accounts} initial={EMPTY} used={usedBy(null)} submitLabel={t('common.add')} submitIcon="starPlus" beforeSubmit={() => canAddEntryPreset(entryPresets)} onSubmit={(input) => save([...entryPresets, newEntryPreset(input)])} clearOnSuccess />
    </>
  )
}
