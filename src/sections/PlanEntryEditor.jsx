import { editEntry, payInitial, formatMoney } from '../ledgerLogic.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { EntryForm } from './Entries.jsx'
import { IconButton } from './Icon.jsx'

// 買い物ごとの残りの行を押したときに、その場で開く入力（基本の PC）。分割は 1 件、リボは、そのカードのリボの仕訳ぜんぶ。
// 日付・金額・メモ・支払い方法（一括／分割の回数／リボ）・年率は、仕訳の入力と同じ部品（EntryForm）で直す。消すもここ。借入の科目は選べない（借入のページで扱う）
export default function PlanEntryEditor({ data, update, entryIds }) {
  const confirm = useConfirm()
  const entries = entryIds.map((id) => data.entries.find((e) => e.id === id)).filter(Boolean)
  const loanIds = (data.loans ?? []).map((l) => l.accountId)
  const accounts = data.accounts.filter((a) => !loanIds.includes(a.id))
  const save = (entry) => (input, memo) => update({ ...data, entries: data.entries.map((e) => (e.id === entry.id ? editEntry(entry, input, memo) : e)) })
  const remove = async (entry) => {
    if (await confirm({ message: t('entries.deleteConfirm') })) update({ ...data, entries: data.entries.filter((e) => e.id !== entry.id) })
  }
  return <div className="b-plan-edit-list">
    {entries.map((entry) => <div key={entry.id} className="b-plan-edit">
      {entries.length > 1 && <p className="note">{entry.date}　{entry.memo}　{formatMoney(entry.amount, data.settings.currency)}</p>}
      <EntryForm
        accounts={accounts}
        initial={{ date: entry.date, amount: String(entry.amount), debitId: entry.debitId, creditId: entry.creditId, memo: entry.memo, living: entry.living ?? null, ...payInitial(entry) }}
        currentIds={[entry.debitId, entry.creditId]}
        favorites={data.settings.favorites}
        submitLabel={t('common.save')}
        submitIcon="check"
        onSubmit={save(entry)}
      />
      <IconButton icon="trash" className="b-danger" label={t('common.delete')} withText onClick={() => remove(entry)} />
    </div>)}
  </div>
}
