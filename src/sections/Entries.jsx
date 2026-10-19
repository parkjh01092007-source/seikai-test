import { useState, useEffect, useRef } from 'react'
import './entries.css'
import {
  entryAccountOptions, validateEntryInput, livingAccount, defaultLiving, livingOnAccountChange, livingOptionLabel, newEntry, editEntry, lastCreditId, favoriteOptionGroups, accountLabelWithType,
  entriesOfMonth, groupEntriesByDate, canEditEntry, formatMoney,
} from '../ledgerLogic.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { usePhone } from '../layout.js'
import { loadOpenMode, initialOpenDates, isOpenDate, formatDayHead, formatDayLabel, entryChanged } from '../entryView.js'
import EntrySheet from './EntrySheet.jsx'
import { AmountInput } from './Calculator.jsx'
import { Icon, IconButton } from './Icon.jsx'
import { useGunjoPc } from '../gunjoPc.js'

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
export function EntryForm({ accounts, initial, submitLabel, submitIcon = 'plus', onSubmit, onCancel, currentIds, favorites = { debit: [], credit: [] }, variant, onValues }) {
  const options = entryAccountOptions(accounts, currentIds)
  const [f, setF] = useState(initial)
  const [error, setError] = useState('')
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }))
  // 借方・貸方を変えたら、生活費の月も整える（同じ科目のままなら選び方を残し、別の収益の科目なら、その科目の決まり。収益がなくなれば消す）
  const setAccount = (k) => (v) => setF((s) => { const next = { ...s, [k]: v }; return { ...next, living: livingOnAccountChange(accounts, s, next) } })
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
    amount: <Field label={t('common.amount')}><AmountInput label={t('common.amount')} value={f.amount} onChange={set('amount')} /></Field>,
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

  if (variant === 'sheet') {
    return (
      <form className="sheet-form" onSubmit={submit}>
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
    <form onSubmit={submit}>
      {fields.date}
      {fields.amount}
      {fields.debit}
      {fields.credit}
      {fields.living}
      <input className="memo-input" placeholder={t('common.memo')} aria-label={t('common.memo')} value={f.memo} onChange={(e) => set('memo')(e.target.value)} />
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
  const [toggled, setToggled] = useState({}) // 日付の枠を押して開閉した分（日付 → 開いているか）。月を変えると初めの状態に戻る。覚えない
  const phone = usePhone()
  const gunjoPc = useGunjoPc() // 群青の PC：月の欄と並べ替えのボタンの間の空白を描かない（間は 12px の余白だけ）
  const valuesRef = useRef(null) // 編集画面の今の入力（変えたかの判定用）
  const fabRef = useRef(null) // 「＋」ボタン（入力画面を閉じたあと、フォーカスを戻す）
  const editedId = useRef(null) // スマホの編集画面を閉じたあと、フォーカスを戻す行
  const confirm = useConfirm()
  const setEntries = (next) => update({ ...data, entries: next })
  const add = (input, memo) => {
    setEntries([...entries, newEntry(input, memo)])
    if (input.date.slice(0, 7) !== month) setToggled({}) // 月が変わるときは、押した分を捨てる（月を変えたのと同じ）
    setToggled((s) => ({ ...s, [input.date]: true })) // 追加した日は、開き方の設定にかかわらず開く
    setMonth(input.date.slice(0, 7)) // 追加した仕訳が見える月に切り替える
    setCreating(false) // スマホの入力画面は、追加できたら閉じる
  }
  const last = lastCreditId(entries)
  const creditId = entryAccountOptions(accounts).some((a) => a.id === last) ? last : '' // 選択肢にあるときだけ使う
  const newInitial = { date: today(), amount: '', debitId: '', creditId, memo: '', living: defaultLiving(accounts, '', creditId) }
  const groups = month ? groupEntriesByDate(entriesOfMonth(entries, month), order) : []
  const initialOpen = initialOpenDates(groups, loadOpenMode(phone ? 'phone' : 'pc')) // 日付の枠の初めの状態（設定 → 仕訳。スマホの幅と PC の幅で別）

  // スマホの編集画面を閉じたあと、フォーカスを押した「編集」ボタン（その行）へ戻す。その行がなくなっていたら（日付や月を変えて保存した）、月の入力欄へ
  useEffect(() => {
    if (editingId !== null || editedId.current === null) return
    const button = document.querySelector(`#card-${CSS.escape(editedId.current)} button`)
    ;(button && !button.closest('[hidden]') ? button : document.querySelector('.entries > input[type="month"]'))?.focus()
    editedId.current = null
  }, [editingId])

  const wasCreating = useRef(false)
  useEffect(() => { // スマホの入力画面を閉じたら、フォーカスを「＋」へ戻す（初めの描画では動かさない）
    if (wasCreating.current && !creating) fabRef.current?.focus({ preventScroll: true })
    wasCreating.current = creating
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
    if (valuesRef.current && entryChanged(newInitial, valuesRef.current)) {
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

  return (
    <div className="entries">
      {/* 入力欄の固定：PC の幅は、入力の行が画面の上に貼り付く（entries.css）。スマホの形は、一覧の上に置かず、右下の「＋」から入力画面を出す */}
      {!phone && <h2>{t('entries.inputTitle')}</h2>}
      {!phone && (
        <EntryForm
          accounts={accounts}
          favorites={settings.favorites}
          initial={newInitial}
          submitLabel={t('common.add')}
          onSubmit={add}
        />
      )}
      <h2>{t('entries.listTitle')}</h2>
      <input type="month" aria-label={t('common.month')} value={month} onChange={(e) => { setMonth(e.target.value); setEditingId(null); setOpenRowId(null); setToggled({}) }} />{gunjoPc ? null : ' '}
      {/* 押すたびに切り替える。表示は、押したら切り替わる先 */}
      <IconButton icon="sort" label={t('entries.sortLabel', { now: t(ORDER_LABELS[order]), next: t(ORDER_LABELS[order === 'asc' ? 'desc' : 'asc']) })} onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')} />
      {!month ? <p className="note">{t('common.chooseMonth')}</p> : groups.length === 0 ? <p className="note">{t('common.noEntriesInMonth')}</p> : (
        groups.map((g) => {
          const open = isOpenDate(g.date, initialOpen, toggled)
          const listId = `day-${g.date}`
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
        })
      )}
      {phone && !editing && !creating && (
        <button ref={fabRef} type="button" className="entry-fab" aria-label={t('entries.fabLabel')} title={t('entries.fabLabel')} onClick={() => { valuesRef.current = null; setCreating(true) }}><Icon name="plus" /></button>
      )}
      {creating && (
        <EntrySheet title={t('entries.newSheetTitle')} onClose={() => setCreating(false)} onOutside={outsideNew}>
          <EntryForm
            variant="sheet"
            accounts={accounts}
            favorites={settings.favorites}
            initial={newInitial}
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
