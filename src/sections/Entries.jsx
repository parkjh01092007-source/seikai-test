import { useState, useEffect, useRef } from 'react'
import './entries.css'
import {
  entryAccountOptions, validateEntryInput, livingAccount, defaultLiving, livingOnAccountChange, livingOptionLabel, newEntry, editEntry, lastCreditId, lastNormalEntry, copyInputFromEntry, presetToFormValues, presetSummary, canMarkNoSpend, isNoSpendShown, noSpendPickerDays, applyNoSpendPick, validateEntryPresetInput, newEntryPreset, canAddEntryPreset, markNoSpendDay, unmarkNoSpendDay, NO_SPEND_BACK_DAYS, favoriteOptionGroups, accountLabelWithType,
  entriesOfMonth, groupEntriesByDate, groupByTens, canEditEntry, formatMoney, formatYen, currencyUnit, roadDays,
} from '../ledgerLogic.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { usePhone } from '../layout.js'
import { loadOpenMode, initialOpenDates, isOpenDate, formatDayHead, formatDayLabel, entryChanged, weekdayName, loadNoSpendShape, loadTensOpen, rememberTensOpen, loadTensBullet, isOpenTens, showTens, formatTensRange } from '../entryView.js'
import EntrySheet from './EntrySheet.jsx'
import PlusMenu from './PlusMenu.jsx'
import NoSpendPicker from './NoSpendPicker.jsx'
import { AmountInput } from './Calculator.jsx'
import { Icon, IconButton } from './Icon.jsx'
import { presetIconId, PRESET_ICON_PICKER } from '../icons.js'
import IconPicker from './PresetIconPicker.jsx'
import { useGunjoPc, useFixedEntries } from '../gunjoPc.js'
import { createPortal } from 'react-dom'
import { useBandHost, useBandTop, useBandRoad } from './bandHost.js'
import { BandStat, signedYen } from './PageBand.jsx'
import MonthRoad from './MonthRoad.jsx'

// favoriteIds：その側（借方か貸方）のお気に入り。一番上に「お気に入り」を出し、そこだけ科目名の後ろに区分を付ける（表示だけ。値は科目の id）
export function AccountSelect({ value, onChange, options, label, favoriteIds = [] }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}</option>
      {favoriteOptionGroups(options, favoriteIds).map((g) => (
        <optgroup key={g.type} label={g.label}>
          {g.accounts.map((a) => <option key={a.id} value={a.id}>{g.withType ? accountLabelWithType(a) : a.name}</option>)}
        </optgroup>
      ))}
    </select>
  )
}

// 入力欄の小さなラベル。スマホの幅だけに出す（PC では、label は箱を持たず、文字も出さないので、今の並びのまま。entries.css）。
// 選んだあとは選択ボックスの「借方」「貸方」の文字が消えるので、どちらか分かるようにする
function Field({ label, className = '', children }) {
  return <label className={`field ${className}`.trim()}><span className="field-label">{label}</span>{children}</label>
}

// 入力・編集で共用。エラーのときは入力途中の内容を消さない。
// currentIds は編集フォームだけが渡す（その仕訳が今使っている科目を選択肢に残す）。新規入力では渡さない。
// variant='sheet'：下から出る編集画面の形（縦に並べ、メモは複数行、下に「やめる」「保存」）。onValues(f)：入力が変わるたびに呼ぶ（編集画面が、変えたかを知るため）
// lastEntry：新しい仕訳の入力だけが渡す（直近の通常の仕訳。なければ null か渡さない）。渡すと「前回と同じ入力」のボタンが出る。編集フォームには渡さない
// noSpend：{ days, entries, today, onToggle(date) }。新しい仕訳の入力だけが渡す。渡すと「今日は使っていない」のボタンが出る（日付の欄の日が対象）
// presets：仕訳プリセットの一覧（渡すと、上に、プリセットのボタンが並ぶ。押すと、借方・貸方・金額・メモが入る）。なければ出さない
// applyValues(values)：入力欄に、外から値を入れる（日付は変えない）。前回と同じ入力と、これからのプリセットが使う
// addPreset：{ list（今のプリセット）, onAdd(input) → 新しいプリセットの id }。新しい仕訳の入力だけが渡す。渡すと「プリセットに追加」の＋付きの星のボタンが出て、押すと入力欄が追加の状態になる（日付の欄は隠れ、記号・名前〔任意〕・保存／やめる。今の借方・貸方・金額・メモを引き継ぐ）
export function EntryForm({ accounts, initial, submitLabel, submitIcon = 'plus', onSubmit, onCancel, currentIds, favorites = { debit: [], credit: [] }, variant, onValues, lastEntry, currency, presets, noSpend, addPreset, quickHost, startAdding = false }) {
  const options = entryAccountOptions(accounts, currentIds)
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  // 借方・貸方を変えたら、生活費の月も整える（同じ科目のままなら選び方を残し、別の収益の科目なら、その科目の決まり。収益がなくなれば消す）
  const setAccount = (k) => (v) => setF((s) => { const next = { ...s, [k]: v }; return { ...next, living: livingOnAccountChange(accounts, s, next) } })
  const formRef = useRef(null)
  const [applied, setApplied] = useState(null) // 最後に反映したもの（プリセットの id か 'copy'＝前回と同じ入力）。反転の表示用
  const [undo, setUndo] = useState(null) // 反映の取り消し用：{ key, before（押す直前の借方・貸方・金額・メモ・生活費の月）, beforeApplied }。反映を押すたびに、直前の 1 つ分だけ覚える
  const [focusTick, setFocusTick] = useState(0) // プリセットを押したあと、金額の欄へフォーカスを移す合図（AmountInput の focusRequest。金額が入っていれば全選択。PC の電卓の帯は、打つまで出さない）
  const applyValues = (values) => { setF((s) => ({ ...s, ...values })); setError('') }
  const sameValues = (values) => ['debitId', 'creditId', 'amount', 'memo'].every((k) => f[k] === values[k]) // 反映したあと、借方・貸方・金額・メモのどれかを変えるまで、反転
  // 反映（プリセット・前回と同じ入力）。反転しているものをもう一度押すと、反映を取り消す（押す直前の値に戻す）。手で変えたあとは反転が消えているので、押すとふつうの反映（取り消し用の値は、そのときの値に更新）。返す値：反映したか
  const press = (key, values) => {
    if (applied === key && undo?.key === key && sameValues(values)) {
      setF((s) => ({ ...s, ...undo.before })); setError(''); setApplied(undo.beforeApplied); setUndo(null)
      return false
    }
    setUndo({ key, before: { debitId: f.debitId, creditId: f.creditId, amount: f.amount, memo: f.memo, living: f.living }, beforeApplied: applied })
    applyValues(values); setApplied(key)
    return true
  }
  const copyValues = lastEntry ? copyInputFromEntry(lastEntry, accounts) : null
  const copyPressed = copyValues !== null && applied === 'copy' && sameValues(copyValues)
  const copyTitle = lastEntry ? t('entries.copyLastTitle', { date: lastEntry.date, debit: accounts.find((a) => a.id === lastEntry.debitId)?.name ?? '', credit: accounts.find((a) => a.id === lastEntry.creditId)?.name ?? '', amount: formatMoney(lastEntry.amount, currency) }) : ''
  const copyButton = lastEntry ? (
    <button type="button" className={copyPressed ? 'copy-last icon-only on' : 'copy-last icon-only'} aria-pressed={copyPressed} aria-label={t('entries.copyLast')} title={copyPressed ? t('entries.undoTitle', { text: copyTitle }) : copyTitle} onClick={() => press('copy', copyValues)}><Icon name="copy" /></button>
  ) : null
  const [adding, setAdding] = useState(startAdding) // プリセットの追加の状態（日付の欄は隠れる）。startAdding：スマホの最初の選ぶ画面の「追加」から開いたとき、初めから追加の状態
  const [addDraft, setAddDraft] = useState({ icon: PRESET_ICON_PICKER[0], name: '' })
  const [addError, setAddError] = useState('')
  const addLimit = addPreset ? canAddEntryPreset(addPreset.list) : { ok: true } // 20 件まで（超えたら追加を止めて、理由を出す）
  const addButton = addPreset ? (
    <button type="button" className="preset-add icon-only" disabled={!addLimit.ok} aria-label={t('presets.addFromForm')} title={addLimit.ok ? t('presets.addFromForm') : addLimit.error} onClick={() => { setAddError(''); setAdding(true) }}><Icon name="starPlus" /></button>
  ) : null
  // プリセットの行：ラベル・プリセットの記号・最後に「プリセットに追加」（＋付きの星。記号と一緒に折り返す）。プリセットが 0 件でも、追加ができる入力欄には行を出す（ラベルと追加のボタンだけ）
  const presetRow = (presets && presets.length > 0) || addButton ? (
    <div className="preset-row" role="group" aria-label={t('presets.chooseLabel')}>
      {/* ボタンは span で包む：群青の PC の「隣り合う部品は余白で 12px あける」規則に、折り返す行を巻き込まないため（間は行の gap） */}
      <span className="preset-label">{t('presets.chooseLabel')}</span>
      {(presets ?? []).map((p) => {
        const values = presetToFormValues(p, accounts)
        const summary = presetSummary(p, accounts, currency)
        const pressed = p.id === applied && sameValues(values)
        return (
          <span key={p.id} className="preset-item">
            <button type="button" className={pressed ? 'preset-chip icon-only on' : 'preset-chip icon-only'} aria-pressed={pressed} aria-label={summary} title={pressed ? t('entries.undoTitle', { text: summary }) : summary} onClick={() => { if (press(p.id, values)) setFocusTick((n) => n + 1) }}><Icon name={presetIconId(p.icon)} /></button>
          </span>
        )
      })}
      {addButton && <span className="preset-item">{addButton}</span>}
    </div>
  ) : null
  let noSpendButton = null
  if (noSpend) {
    const shown = isNoSpendShown(noSpend.days, noSpend.entries, f.date)
    const can = canMarkNoSpend(noSpend.entries, f.date, noSpend.today)
    const md = f.date.slice(5).replace('-', '/')
    const label = f.date === noSpend.today ? t('entries.noSpendToday') : t('entries.noSpendDate', { md })
    const date = f.date === noSpend.today ? t('entries.noSpendDateToday', { md }) : md // ボタンが日付の欄から離れたので、対象の日を、title・読み上げにいつも出す（今日は「10/22（今日）」）
    const why = { hasEntries: 'entries.noSpendHasEntries', future: 'entries.noSpendRange', old: 'entries.noSpendRange', invalid: 'entries.noSpendRange' }[can.reason]
    noSpendButton = (
      <button type="button" className={shown ? 'no-spend on' : 'no-spend'} aria-pressed={shown} disabled={!shown && !can.ok}
        aria-label={shown ? t('entries.noSpendDoneAria', { date }) : t('entries.noSpendAria', { date })}
        title={shown ? t('entries.noSpendUndoTitle', { date }) : can.ok ? t('entries.noSpendTitle', { date }) : t(why, { days: NO_SPEND_BACK_DAYS })}
        onClick={() => noSpend.onToggle(f.date)}><Icon name={shown ? 'circleScribble' : 'circle'} />{shown ? (f.date === noSpend.today ? t('entries.noSpendDone') : t('entries.noSpendDoneDate', { md })) : label}</button>
    )
  }
  // 前回と同じ入力（複製の絵）と今日は使っていない（円）を 1 行に。span で包むのは、群青の PC の「隣り合う部品は余白で 12px」規則に巻き込まないため（間は行の gap）
  const quickRow = copyButton || noSpendButton ? (
    <div className="quick-row">{copyButton && <span>{copyButton}</span>}{noSpendButton && <span>{noSpendButton}</span>}</div>
  ) : null
  // 「前回と同じ入力」「今日は使っていない」「プリセットに追加」のボタン：新しい仕訳の枠（欄）の外、見出しの右端（群青の札・基本）／入力画面の上端（スマホ）に出す。quickHost（見出しの中の置き場所）があれば、そこへ移す。なければ、欄の中に出す
  const placeQuick = quickRow && quickHost ? createPortal(quickRow, quickHost) : quickRow
  const showLiving = livingAccount(accounts, f.debitId, f.creditId) !== undefined // 収益の科目（調整益を除く）を選んだときだけ
  useEffect(() => { onValues?.(f) }, [f]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => {
    e.preventDefault()
    const r = validateEntryInput({ ...f, amountText: f.amount }, accounts)
    if (r.error) return setError(r.error)
    setError('')
    onSubmit(r, f.memo)
    setF((s) => ({ ...s, amount: '', memo: '', living: defaultLiving(accounts, s.debitId, s.creditId) })) // 成功時は金額とメモを空にし、生活費の月は科目の決まりに戻す（一度きりの変更を、次の仕訳に残さない）
  }

  const fields = {
    date: <Field label={t('common.date')}><input type="date" aria-label={t('common.date')} value={f.date} onChange={(e) => set('date')(e.target.value)} /></Field>,
    amount: <Field label={t('common.amount')}><AmountInput label={t('common.amount')} value={f.amount} onChange={set('amount')} focusRequest={focusTick} /></Field>,
    debit: <Field label={t('common.debit')}><AccountSelect label={t('common.debit')} value={f.debitId} onChange={setAccount('debitId')} options={options} favoriteIds={favorites.debit} /></Field>,
    credit: <Field label={t('common.credit')}><AccountSelect label={t('common.credit')} value={f.creditId} onChange={setAccount('creditId')} options={options} favoriteIds={favorites.credit} /></Field>,
    living: showLiving && (
      <Field label={t('living.month')} className="living">
        <select aria-label={t('living.month')} value={f.living ?? ''} onChange={(e) => set('living')(e.target.value)}>
          {['same', 'next'].map((l) => <option key={l} value={l}>{livingOptionLabel(f.date, l)}</option>)}
        </select>
      </Field>
    ),
  }

  // プリセットの追加の状態：日付の欄は隠れ、記号の選択・名前（任意）・借方・貸方・金額・メモ（今の入力を引き継ぐ）・保存／やめる
  if (adding && addPreset) {
    const saveAdd = (e) => {
      e.preventDefault()
      if (!addLimit.ok) return setAddError(addLimit.error)
      const r = validateEntryPresetInput({ name: addDraft.name, icon: addDraft.icon, debitId: f.debitId, creditId: f.creditId, amountText: f.amount, memo: f.memo }, accounts)
      if (r.error) return setAddError(r.error)
      const id = addPreset.onAdd(r)
      setAddError(''); setAdding(false); setApplied(id); setUndo(null) // 入力はそのまま。追加したプリセットは反転（値が同じなので）
    }
    const used = new Set(addPreset.list.map((p) => presetIconId(p.icon)))
    return (
      <form className={`preset-add-form${variant === 'card' ? ' g-slip' : variant === 'sheet' ? ' sheet-form' : ''}`} ref={formRef} onSubmit={saveAdd}>
        <span className="preset-add-title">{t('presets.addMode')}</span>
        <div className="pset-pick-row"><IconPicker value={addDraft.icon} onChange={(icon) => setAddDraft((d) => ({ ...d, icon }))} used={used} /></div>
        <Field label={t('presets.namePlaceholder')}><input aria-label={t('common.name')} placeholder={t('presets.namePlaceholder')} value={addDraft.name} onChange={(e) => setAddDraft((d) => ({ ...d, name: e.target.value }))} /></Field>
        {fields.debit}
        {fields.credit}
        {fields.amount}
        <Field label={t('common.memo')}><input className="memo-input" aria-label={t('common.memo')} value={f.memo} onChange={(e) => set('memo')(e.target.value)} /></Field>
        {addError && <span className="error">{addError}</span>}
        <div className="sheet-actions">
          <button type="button" onClick={() => { setAdding(false); setAddError('') }}><Icon name="close" />{t('entries.sheetClose')}</button>
          <button className="primary"><Icon name="check" />{t('common.save')}</button>
        </div>
      </form>
    )
  }

  // variant='card'：群青の PC の入力の札（見本 E-entries）。ラベルが上の縦の並び（日付・借方・貸方・金額・メモ）と、幅いっぱいの大きい「追加」
  if (variant === 'card') {
    return (
      <form className="g-slip" ref={formRef} onSubmit={submit}>
        {presetRow}
        {placeQuick}
        {fields.date}
        {fields.debit}
        {fields.credit}
        {fields.living}
        {fields.amount}
        <Field label={t('common.memo')}><input className="memo-input" aria-label={t('common.memo')} value={f.memo} onChange={(e) => set('memo')(e.target.value)} /></Field>
        {error && <span className="error">{error}</span>}
        <button className="primary large"><Icon name={submitIcon} />{submitLabel}</button>
      </form>
    )
  }

  if (variant === 'sheet') {
    return (
      <form className="sheet-form" ref={formRef} onSubmit={submit}>
        {presetRow}
        {placeQuick}
        {fields.date}
        {fields.amount}
        <div className="sheet-pair">{fields.debit}{fields.credit}</div>
        {fields.living}
        <Field label={t('common.memo')}><textarea className="memo-input" rows={3} aria-label={t('common.memo')} value={f.memo} onChange={(e) => set('memo')(e.target.value)} /></Field>
        {error && <span className="error">{error}</span>}
        <div className="sheet-actions">
          <button type="button" onClick={onCancel}><Icon name="close" />{t('entries.sheetClose')}</button>
          <button className="primary"><Icon name={submitIcon} />{submitLabel}</button>
        </div>
      </form>
    )
  }

  return (
    <form ref={formRef} onSubmit={submit}>
      {fields.date}
      {fields.amount}
      {fields.debit}
      {fields.credit}
      {fields.living}
      <input className="memo-input" placeholder={t('common.memo')} aria-label={t('common.memo')} value={f.memo} onChange={(e) => set('memo')(e.target.value)} />
      {presetRow}
      {placeQuick}
      <button><Icon name={submitIcon} />{submitLabel}</button>
      {onCancel && <button type="button" onClick={onCancel}><Icon name="close" />{t('entries.sheetClose')}</button>}
      {error && <span className="error">{error}</span>}
    </form>
  )
}

// 読むたびに辞書から取る（読み込み時に固めない）。LedgerBook も同じ書き方で使う
export const KIND_LABELS = {
  normal: '',
  get opening() { return t('entries.kind.opening') },
  get adjustment() { return t('entries.kind.adjustment') },
}

function EntryRow({ entry, number, accounts, favorites, currency, editing, onEdit, onCancel, onSave, onDelete }) {
  const gunjoPc = useGunjoPc()
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  if (editing) {
    return (
      <li>
        <EntryForm
          accounts={accounts}
          initial={{ date: entry.date, amount: String(entry.amount), debitId: entry.debitId, creditId: entry.creditId, memo: entry.memo, living: entry.living ?? null }}
          currentIds={[entry.debitId, entry.creditId]}
          favorites={favorites}
          submitLabel={t('common.save')}
          submitIcon="check"
          onSubmit={onSave}
          onCancel={onCancel}
        />
      </li>
    )
  }
  // 群青の PC（見本 E-entries）：左に「借方 ／ 貸方」とメモ、右に金額（明朝）と編集・削除
  if (gunjoPc) {
    return (
      <li className="row g-row">
        <div className="g-main">
          <div className="g-names">{name(entry.debitId)}<span className="g-sep">{t('entries.pairSeparator')}</span>{name(entry.creditId)}</div>
          {(entry.memo || KIND_LABELS[entry.kind]) && (
            <div className="g-memo">
              {KIND_LABELS[entry.kind] && <span>{t('entries.kindNote', { kind: KIND_LABELS[entry.kind] })}{entry.memo ? ' ' : ''}</span>}
              {entry.memo}
            </div>
          )}
        </div>
        <span className="amount">{formatMoney(entry.amount, currency)}</span>
        <span className="g-ops">
          {canEditEntry(entry) && (
            <>
              <IconButton icon="edit" label={t('common.edit')} onClick={onEdit} />
              <IconButton icon="trash" label={t('common.delete')} onClick={onDelete} />
            </>
          )}
        </span>
      </li>
    )
  }
  return (
    <li className="row">
      <span>{number}.</span>
      <span className="cell debit">{name(entry.debitId)}</span>
      <span className="cell">{name(entry.creditId)}</span>
      <span className="amount">{formatMoney(entry.amount, currency)}</span>
      <span className="cell">
        {KIND_LABELS[entry.kind] && <span className="note">{t('entries.kindNote', { kind: KIND_LABELS[entry.kind] })}</span>}
        {entry.memo}
      </span>
      <span>
        {canEditEntry(entry) && (
          <>
            <IconButton icon="edit" label={t('common.edit')} onClick={onEdit} />
            <IconButton icon="trash" label={t('common.delete')} onClick={onDelete} />
          </>
        )}
      </span>
    </li>
  )
}

// スマホの幅の1件（spec-mobile.md 5.2）：2行のカード。押すと開く（開いている行は1つだけ。Entries が持つ）。開くと、全部の文字と、編集・削除（開始残高・残高調整は種類だけ）が出る
function EntryCard({ entry, number, accounts, currency, open, onToggle, onEdit, onDelete }) {
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  const detailId = `card-${entry.id}`
  return (
    <li className={`card${open ? ' open' : ''}`}>
      <button type="button" className="card-toggle" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
        <span className="no">{number}.</span>
        <span className="names">{name(entry.debitId)}{t('entries.pairSeparator')}{name(entry.creditId)}</span>
        <span className="amount">{formatMoney(entry.amount, currency)}</span>
        {entry.memo && <span className="memo">{entry.memo}</span>}
      </button>
      <div id={detailId} className="card-actions" hidden={!open}>
        {canEditEntry(entry) ? (
          <>
            <IconButton icon="edit" label={t('common.edit')} withText onClick={onEdit} />
            <IconButton icon="trash" label={t('common.delete')} withText className="danger" onClick={onDelete} />
          </>
        ) : <span className="note">{t('entries.kindNote', { kind: KIND_LABELS[entry.kind] })}</span>}
      </div>
    </li>
  )
}

const ORDER_LABELS = { asc: 'entries.orderAsc', desc: 'entries.orderDesc' } // 日付の枠の並びの切り替えボタンの文言（辞書のキー）

export default function Entries({ data, update }) {
  const { accounts, entries, settings } = data
  const [month, setMonth] = useState(() => today().slice(0, 7))
  const [editingId, setEditingId] = useState(null)
  const [order, setOrder] = useState('asc') // 日付の枠の並び。画面の中だけで持ち、保存しない（画面を移る・再読み込みで古い順に戻る）
  const [openRowId, setOpenRowId] = useState(null) // 開いている行（スマホの幅のカード。1つだけ）。月を変える・その日を閉じると閉じる
  const [creating, setCreating] = useState(false) // スマホ：右下の「＋」から開く、新しい仕訳の入力画面
  const [menuOpen, setMenuOpen] = useState(false) // スマホ：「＋」の上に出るメニュー
  const [picking, setPicking] = useState(false) // スマホ：「使っていない日」の日の選択（ポップアップ）
  const [startAdd, setStartAdd] = useState(false) // メニューの「プリセット作成」から開いた入力画面は、初めから追加の状態
  const [fill, setFill] = useState(null) // メニューの「前回と同じ入力」の値（借方・貸方・金額・メモ・生活費の月）。入力画面の初めの値に重ねる
  const bullet = loadTensBullet() // 展開したグループの中の、日の枠の頭の記号（端末ごと。群青の PC は日の大きな数字があるので CSS で出さない）
  const [tensToggled, setTensToggled] = useState(loadTensOpen) // 10 件ずつのグループを押して開閉した分（グループの最初の日 → 開いているか）。端末ごとに覚える
  const [toggled, setToggled] = useState({}) // 日付の枠を押して開閉した分（日付 → 開いているか）。月を変えると初めの状態に戻る。覚えない
  const phone = usePhone()
  const gunjoPc = useGunjoPc() // 群青の PC：月の欄と並べ替えのボタンの間の空白を描かない（間は 12px の余白だけ）
  const fixedList = useFixedEntries() // 一覧の領域だけが中でスクロールする高さ
  const listRef = useRef(null)
  const bandHost = useBandHost()
  const bandTop = useBandTop()
  const bandRoad = useBandRoad()
  const valuesRef = useRef(null) // 編集画面の今の入力（変えたかの判定用）
  const fabRef = useRef(null) // 「＋」ボタン（入力画面を閉じたあと、フォーカスを戻す）
  const editedId = useRef(null) // スマホの編集画面を閉じたあと、フォーカスを戻す行
  const confirm = useConfirm()
  const setEntries = (next) => update({ ...data, entries: next })
  const add = (input, memo) => {
    const made = newEntry(input, memo)
    setEntries([...entries, made])
    openTensOf([...entries, made], input.date) // 追加した仕訳のグループは開く
    if (input.date.slice(0, 7) !== month) setToggled({}) // 月が変わるときは、押した分を捨てる（月を変えたのと同じ）
    setToggled((s) => ({ ...s, [input.date]: true })) // 追加した日は、開き方の設定にかかわらず開く
    setMonth(input.date.slice(0, 7)) // 追加した仕訳が見える月に切り替える
    setCreating(false) // スマホの入力画面は、追加できたら閉じる
  }
  const lastEntry = lastNormalEntry(entries, data.subscriptions) // 「前回と同じ入力」の元（定期支払いの自動記入は除く）
  const last = lastCreditId(entries)
  const creditId = entryAccountOptions(accounts).some((a) => a.id === last) ? last : '' // 選択肢にあるときだけ使う
  const newInitial = { date: today(), amount: '', debitId: '', creditId, memo: '', living: defaultLiving(accounts, '', creditId) }
  const [quickHost, setQuickHost] = useState(null) // 見出しの右端（スマホは入力画面の上端）の、ボタンの置き場所
  const presets = data.entryPresets
  const addPreset = { list: presets, onAdd: (input) => { const p = newEntryPreset(input); update({ ...data, entryPresets: [...presets, p] }); return p.id } } // 入力欄から、今の入力をプリセットに追加
  // 「今日は使っていない」：日付の欄の日に印を付ける・外す（仕訳とは別の noSpendDays。残高・月次などには影響しない）
  const noSpend = { days: data.noSpendDays, entries, today: today(), onToggle: (date) => update({ ...data, noSpendDays: data.noSpendDays.includes(date) ? unmarkNoSpendDay(data.noSpendDays, date) : markNoSpendDay(data.noSpendDays, date) }) }
  // スマホの「＋」メニュー（上から）：仕訳入力・前回と同じ入力・プリセット作成・使っていない日
  const openSheet = (opts = {}) => { valuesRef.current = null; setFill(opts.fill ?? null); setStartAdd(!!opts.startAdd); setMenuOpen(false); setCreating(true) }
  const presetFull = canAddEntryPreset(presets)
  const plusItems = [
    { key: 'entry', icon: 'edit', label: t('plusMenu.entry'), onSelect: () => openSheet() },
    { key: 'copy', icon: 'copy', label: t('plusMenu.copy'), disabledReason: lastEntry ? '' : t('plusMenu.copyNone'), onSelect: () => openSheet({ fill: copyInputFromEntry(lastEntry, accounts) }) },
    { key: 'preset', icon: 'starPlus', label: t('plusMenu.preset'), disabledReason: presetFull.ok ? '' : presetFull.error, onSelect: () => openSheet({ startAdd: true }) },
    { key: 'nospend', icon: 'circle', label: t('plusMenu.noSpend'), onSelect: () => { setMenuOpen(false); setPicking(true) } },
  ]
  const sheetInitial = fill ? { ...newInitial, ...fill } : newInitial // スマホの入力画面の初めの値（プリセットを選んだときは、その値）
  const openTensOf = (all, date) => { // その日が入るグループ（追加後の仕訳で数える）を、開いた状態で覚える
    const m = date.slice(0, 7)
    const g = groupByTens(groupEntriesByDate(entriesOfMonth(all, m)), accounts).find((x) => x.days.some((d) => d.date === date))
    if (!g) return
    const next = { ...tensToggled, [g.key]: true }
    setTensToggled(next)
    rememberTensOpen(next)
  }
  const changeMonth = (v) => { setMonth(v); setEditingId(null); setOpenRowId(null); setToggled({}) }
  const shiftMonth = (d) => { const [y, m] = month.split('-').map(Number); const x = new Date(y, m - 1 + d, 1); changeMonth(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`) } // 前の月・次の月（群青の PC の帯）
  const road = gunjoPc && month ? roadDays(accounts, entries, month, today(), data.noSpendDays) : null // 月の道（群青の PC の帯 L）
  const groups = month ? groupEntriesByDate(entriesOfMonth(entries, month), order) : []
  const tens = month ? groupByTens(groupEntriesByDate(entriesOfMonth(entries, month)), accounts, order) : [] // 10 件を超える月だけ、見出しを出す（以下は今までと同じ）
  const withTens = showTens(tens)
  const initialOpen = initialOpenDates(groups, loadOpenMode(phone ? 'phone' : 'pc')) // 日付の枠の初めの状態（設定 → 仕訳。スマホの幅と PC の幅で別）

  // スマホの編集画面を閉じたあと、フォーカスを押した「編集」ボタン（その行）へ戻す。その行がなくなっていたら（日付や月を変えて保存した）、月の入力欄へ
  useEffect(() => {
    if (editingId !== null || editedId.current === null) return
    const button = document.querySelector(`#card-${CSS.escape(editedId.current)} button`)
    ;(button && !button.closest('[hidden]') ? button : document.querySelector('.entries > input[type="month"]'))?.focus()
    editedId.current = null
  }, [editingId])

  // 帯の 2 段（gunjo-pc.css の固定）：一覧を、先頭の余白（＝大きい帯と小さい帯の差）の分だけスクロールしたら、main-col に data-band-low を付けて帯を小さくする。しきい値は余白の実測（同じ CSS 変数から作られる）。DOM 直接：再描画しない
  useEffect(() => {
    const list = listRef.current, col = list?.closest('.main-col')
    if (!list || !col) return
    const sync = () => {
      const diff = parseFloat(getComputedStyle(list).paddingTop) || 0
      if (diff > 0 && list.scrollTop >= diff) col.setAttribute('data-band-low', '')
      else col.removeAttribute('data-band-low')
    }
    sync()
    list.addEventListener('scroll', sync, { passive: true })
    window.addEventListener('resize', sync)
    return () => { list.removeEventListener('scroll', sync); window.removeEventListener('resize', sync); col.removeAttribute('data-band-low') }
  }, [gunjoPc, fixedList, month])

  const wasCreating = useRef(false)
  useEffect(() => { // スマホの入力画面を閉じたら、フォーカスを「＋」へ戻す（初めの描画では動かさない）
    if (wasCreating.current && !creating) fabRef.current?.focus({ preventScroll: true })
    wasCreating.current = creating
    if (!creating) { setFill(null); setStartAdd(false) }
  }, [creating])

  const save = (entry) => (input, memo) => {
    setEntries(entries.map((e) => (e.id === entry.id ? editEntry(entry, input, memo) : e)))
    setEditingId(null)
  }
  const editing = phone && editingId !== null ? entries.find((e) => e.id === editingId) : undefined
  const editingNth = editing ? (groups.find((g) => g.date === editing.date)?.entries.findIndex((e) => e.id === editing.id) ?? 0) + 1 : 0
  // 外側（幕）を押したとき：変えていなければ閉じる。変えていれば「変更を捨てますか」（アプリ内の確認画面）
  const outside = async () => {
    const initial = { date: editing.date, amount: String(editing.amount), debitId: editing.debitId, creditId: editing.creditId, memo: editing.memo, living: editing.living ?? null }
    if (valuesRef.current && entryChanged(initial, valuesRef.current)) {
      if (!(await confirm({ message: t('entries.discardConfirm') }))) {
        document.querySelector('.sheet input[type="date"]')?.focus() // 幕を押してフォーカスが外れているので、編集画面の中へ戻す
        return
      }
    }
    setEditingId(null)
  }
  // 外側（幕）を押したとき（新しい仕訳）：何も入力していなければ閉じる。入力していれば「変更を捨てますか」
  const outsideNew = async () => {
    if (valuesRef.current && entryChanged(sheetInitial, valuesRef.current)) {
      if (!(await confirm({ message: t('entries.discardConfirm') }))) {
        document.querySelector('.sheet input[type="date"]')?.focus()
        return
      }
    }
    setCreating(false)
  }
  const remove = async (entry) => {
    if (!(await confirm({ message: t('entries.deleteConfirm') }))) return
    setEntries(entries.filter((e) => e.id !== entry.id))
  }

  const renderDay = (g) => {
          const open = isOpenDate(g.date, initialOpen, toggled)
          const listId = `day-${g.date}`
          if (gunjoPc) {
            // 群青の PC：日ごとの青い線、左に大きな日付（開閉のボタン）・「10月・日曜日」・「計 3,900円」（0 の日は出さない）、右にその日の行
            const sum = road?.days[Number(g.date.slice(8, 10)) - 1]?.amount ?? 0
            return (
              <section key={g.date} className="g-daybox">
                <h3>
                  <button type="button" className="day-toggle g-day-head" aria-expanded={open} aria-controls={listId} aria-label={formatDayHead(g.date, g.entries.length)} onClick={() => { if (open && g.entries.some((e) => e.id === openRowId)) setOpenRowId(null); setToggled((s) => ({ ...s, [g.date]: !open })) }}>
                    <b className="g-dnum">{Number(g.date.slice(8, 10))}</b>
                    <span className="g-dsub">{t('entries.dayCaption', { m: Number(g.date.slice(5, 7)), wd: weekdayName(g.date) })}</span>
                    {sum !== 0 && <em className="g-dsum">{t('entries.dayTotal', { amount: formatMoney(sum, settings.currency) })}</em>}
                    <span className="mark"><Icon name={open ? 'chevDown' : 'chevRight'} /></span>
                  </button>
                </h3>
                <div id={listId} hidden={!open}>
                  <ol>
                    {g.entries.map((e, i) => (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        number={i + 1}
                        accounts={accounts}
                        favorites={settings.favorites}
                        currency={settings.currency}
                        editing={editingId === e.id}
                        onEdit={() => { editedId.current = null; setEditingId(e.id) }}
                        onCancel={() => setEditingId(null)}
                        onSave={save(e)}
                        onDelete={() => remove(e)}
                      />
                    ))}
                  </ol>
                </div>
              </section>
            )
          }
          return (
            <section key={g.date} className="day">
              <h3>
                <button type="button" className="day-toggle" aria-expanded={open} aria-controls={listId} onClick={() => { if (open && g.entries.some((e) => e.id === openRowId)) setOpenRowId(null); setToggled((s) => ({ ...s, [g.date]: !open })) }}>
                  <span>{formatDayHead(g.date, g.entries.length)}</span>
                  <span className="mark"><Icon name={open ? 'chevDown' : 'chevRight'} /></span>
                </button>
              </h3>
              <div id={listId} hidden={!open}>
                <div className="head">
                  <span />
                  <span className="debit">{t('common.debit')}</span>
                  <span>{t('common.credit')}</span>
                  <span className="amount">{t('common.amount')}</span>
                  <span />
                  <span />
                </div>
                <ol>
                  {g.entries.map((e, i) => {
                    const common = {
                      entry: e,
                      number: i + 1,
                      accounts,
                      favorites: settings.favorites,
                      currency: settings.currency,
                      editing: editingId === e.id,
                      onEdit: () => { editedId.current = phone ? e.id : null; setEditingId(e.id) }, // スマホは、閉じたあとフォーカスを戻せるよう、行を開いたままにする
                      onCancel: () => setEditingId(null),
                      onSave: save(e),
                      onDelete: () => remove(e),
                    }
                    return phone
                      ? <EntryCard key={e.id} {...common} open={openRowId === e.id} onToggle={() => setOpenRowId(openRowId === e.id ? null : e.id)} />
                      : <EntryRow key={e.id} {...common} />
                  })}
                </ol>
              </div>
            </section>
          )
  }
  const renderTens = (tn) => {
    const open = isOpenTens(tn.key, tens, tensToggled)
    const id = `tens-${tn.key}`
    const range = formatTensRange(tn)
    const money = (n) => formatMoney(n, settings.currency)
    return (
      <section key={tn.key} className="tens" data-bullet={bullet}>
        <h3>
          <button type="button" className="tens-toggle" aria-expanded={open} aria-controls={id} aria-label={t('entries.tensLabel', { range, count: tn.count, amount: money(tn.total), max: money(tn.max) })} onClick={() => { const next = { ...tensToggled, [tn.key]: !open }; setTensToggled(next); rememberTensOpen(next) }}>
            <span className="tens-range">{range}</span>
            <span>{t('entries.tensCount', { count: tn.count })}</span>
            <span className="tens-sum">{t('entries.tensTotal', { amount: money(tn.total) })}</span>
            <span className="tens-sum">{t('entries.tensMax', { amount: money(tn.max) })}</span>
            <span className="mark"><Icon name={open ? 'chevDown' : 'chevRight'} /></span>
          </button>
        </h3>
        <div id={id} hidden={!open}>{tn.days.map(renderDay)}</div>
      </section>
    )
  }
  const list = !month ? <p className="note">{t('common.chooseMonth')}</p> : groups.length === 0 ? <p className="note">{t('common.noEntriesInMonth')}</p> : withTens ? tens.map(renderTens) : groups.map(renderDay)

  return (
    <div className="entries">
      {/* 群青の PC（見本 E-entries）：帯 L に、月の選び（前の月・今の月・次の月）、10月の費用と今月の仕訳の件数、月の道 */}
      {bandTop && createPortal(
        <div className="g-month">
          <IconButton icon="chevRight" className="g-prev" label={t('entries.monthPrev')} disabled={!month} onClick={() => shiftMonth(-1)} />
          <input type="month" aria-label={t('common.month')} value={month} onChange={(e) => changeMonth(e.target.value)} />
          <IconButton icon="chevRight" label={t('entries.monthNext')} disabled={!month} onClick={() => shiftMonth(1)} />
        </div>, bandTop)}
      {bandHost && road && createPortal(<>
        <BandStat label={t('entries.heroSpend', { m: Number(month.slice(5)) })} value={signedYen(road.total, formatYen)} unit={currencyUnit(settings.currency)} />
        <BandStat label={t('entries.heroCount')} value={road.days.reduce((s, d) => s + d.count, 0)} unit={t('settings.countUnit')} />
      </>, bandHost)}
      {bandRoad && road && createPortal(<MonthRoad road={road} currency={settings.currency} shape={loadNoSpendShape()} />, bandRoad)}
      {gunjoPc ? (
        // 群青の PC（見本 E-entries）：左に「新しい仕訳」の札（画面の上に貼り付く）、右に一覧（並べ替えのボタンと、日ごとの枠）。画面の名前は帯のマス
        <div className="g-entries-body">
          {/* 札（白い四角）と、その下の外側のボタンの行（前回と同じ入力・今日は使っていない）を、1 つの入れ物に（貼り付く・高さの予算は入れ物が持ち、札だけが中でスクロールする。ボタンの行は見切れない） */}
          <div className="g-slip-col">
          <section className="g-card g-slip-card">
            <h2 className="g-h">{t('entries.cardTitle')}<small lang="en">{t('entries.cardEn')}</small></h2>
            <EntryForm
              variant="card"
              accounts={accounts}
              favorites={settings.favorites}
              initial={newInitial}
              lastEntry={lastEntry}
              currency={settings.currency}
              presets={presets}
              noSpend={noSpend}
              addPreset={addPreset}
              quickHost={quickHost}
              submitLabel={t('common.add')}
              onSubmit={add}
            />
          </section>
          <span className="quick-host" ref={setQuickHost} />
          </div>
          <div className="g-entries-list" ref={listRef} {...(fixedList ? { tabIndex: 0, role: 'region', 'aria-label': t('entries.listTitle') } : {})}>
      {/* 押すたびに切り替える。表示は、押したら切り替わる先 */}
      <IconButton icon="sort" label={t('entries.sortLabel', { now: t(ORDER_LABELS[order]), next: t(ORDER_LABELS[order === 'asc' ? 'desc' : 'asc']) })} onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')} />
      {list}
          </div>
        </div>
      ) : (
        <>
      {/* 入力欄の固定：PC の幅は、入力の行が画面の上に貼り付く（entries.css）。スマホの形は、一覧の上に置かず、右下の「＋」から入力画面を出す */}
      {!phone && <h2>{t('entries.inputTitle')}</h2>}
      {!phone && (
        <div className="entries-top">
        <EntryForm
          accounts={accounts}
          favorites={settings.favorites}
          initial={newInitial}
          lastEntry={lastEntry}
          currency={settings.currency}
          presets={presets}
          noSpend={noSpend}
          addPreset={addPreset}
          quickHost={quickHost}
          submitLabel={t('common.add')}
          onSubmit={add}
        />
        <span className="quick-host" ref={setQuickHost} />
        </div>
      )}
      <h2>{t('entries.listTitle')}</h2>
      {!gunjoPc && <input type="month" aria-label={t('common.month')} value={month} onChange={(e) => changeMonth(e.target.value)} />}{gunjoPc ? null : ' '}
      {/* 押すたびに切り替える。表示は、押したら切り替わる先 */}
      <IconButton icon="sort" label={t('entries.sortLabel', { now: t(ORDER_LABELS[order]), next: t(ORDER_LABELS[order === 'asc' ? 'desc' : 'asc']) })} onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')} />
      {list}
        </>
      )}
      {phone && !editing && !creating && (
        <PlusMenu open={menuOpen} fabRef={fabRef} onToggle={() => setMenuOpen((o) => !o)} onClose={() => setMenuOpen(false)} items={plusItems} />
      )}
      {picking && (
        <NoSpendPicker days={noSpendPickerDays(entries, data.noSpendDays, today())}
          onClose={() => { setPicking(false); fabRef.current?.focus({ preventScroll: true }) }}
          onConfirm={(result) => { update({ ...data, noSpendDays: applyNoSpendPick(data.noSpendDays, result) }); setPicking(false); fabRef.current?.focus({ preventScroll: true }) }} />
      )}
      {creating && (
        <EntrySheet title={t('entries.newSheetTitle')} onClose={() => setCreating(false)} onOutside={outsideNew} focus={fill ? 'amount' : undefined}>
          <EntryForm
            variant="sheet"
            accounts={accounts}
            favorites={settings.favorites}
            initial={sheetInitial}
            currency={settings.currency}
            presets={presets}
            addPreset={addPreset}
            startAdding={startAdd}
            submitLabel={t('common.add')}
            onSubmit={add}
            onCancel={() => setCreating(false)}
            onValues={(f) => { valuesRef.current = f }}
          />
        </EntrySheet>
      )}
      {editing && (
        <EntrySheet nth={t('entries.sheetNth', { date: formatDayLabel(editing.date), n: editingNth })} onClose={() => setEditingId(null)} onOutside={outside}>
          <EntryForm
            variant="sheet"
            accounts={accounts}
            initial={{ date: editing.date, amount: String(editing.amount), debitId: editing.debitId, creditId: editing.creditId, memo: editing.memo, living: editing.living ?? null }}
            currentIds={[editing.debitId, editing.creditId]}
            favorites={settings.favorites}
            submitLabel={t('common.save')}
          submitIcon="check"
            onSubmit={save(editing)}
            onCancel={() => setEditingId(null)}
            onValues={(f) => { valuesRef.current = f }}
          />
        </EntrySheet>
      )}
    </div>
  )
}
