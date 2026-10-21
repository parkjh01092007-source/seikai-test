import { useState } from 'react'
import { createPortal } from 'react-dom'
import './ledger.css'
import {
  TYPES, TYPE_LABELS, ROLES, ROLE_LABELS, newAccount, changeType, validateAccountName,
  isProtected, hasLivingMonth, hasFixed, canDeleteAccount, canChangeType, canChangeRole, hasBudget, removeAccountFromSettings,
} from '../ledgerLogic.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { usePhone } from '../layout.js'
import { Icon, IconButton } from './Icon.jsx'
import { useGunjoPc } from '../gunjoPc.js'
import { useBandHost } from './bandHost.js'
import { BandStat } from './PageBand.jsx'

function RoleSelect({ value, onChange, disabled }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
    </select>
  )
}

function TypeSelect({ value, onChange, disabled }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
    </select>
  )
}

// 1科目の編集の中身（名前の変更、種類、役割、使う／使わない、削除、変えられない理由）。PC は一覧の行、スマホは、行を押して開く欄の中に出す
function AccountEditor({ account, accounts, entries, subscriptions, budgets, onChange, onDelete }) {
  const [name, setName] = useState(account.name)
  const [error, setError] = useState('')
  const confirm = useConfirm()
  const gunjoPc = useGunjoPc() // 群青の PC：部品の間の空白を描かない（間は 12px の余白だけ）
  const sp = gunjoPc ? null : ' '
  const locked = isProtected(account)
  const deletable = canDeleteAccount(account, entries, subscriptions, budgets)
  const typeEditable = canChangeType(account, entries, subscriptions, budgets)
  const roleEditable = canChangeRole(account, budgets) // 予算がある科目は、role も変えられない
  const touch = (patch) => onChange({ ...account, ...patch, updatedAt: new Date().toISOString() })

  const saveName = () => {
    const r = validateAccountName(name, accounts, account.id)
    if (r.error) return setError(r.error)
    setError('')
    if (r.name !== account.name) touch({ name: r.name })
    setName(r.name)
  }

  const remove = async () => {
    if (await confirm({ message: t('ledger.deleteConfirm', { name: account.name }) })) onDelete()
  }

  return (
    <>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={saveName}>{t('common.rename')}</button>{sp}
      <TypeSelect value={account.type} disabled={!typeEditable} onChange={(type) => onChange(changeType(account, type, 'other'))} />
      {account.type === 'asset' && <RoleSelect value={account.role} disabled={!roleEditable} onChange={(role) => touch({ role })} />}
      {account.type === 'liability' && (
        <span className="note">{sp}{ROLE_LABELS[account.role]}{account.role === 'card' && t('ledger.cardDays', { closing: account.closingDay, pay: account.payDay })}</span>
      )}{sp}
      {hasLivingMonth(account) && (
        <label className="living-month">{t('living.month')} <select value={account.livingMonth} onChange={(e) => touch({ livingMonth: e.target.value })}>
          <option value="same">{t('living.same')}</option>
          <option value="next">{t('living.next')}</option>
        </select></label>
      )}{sp}
      {hasFixed(account) && (
        <label className="fixed-flag"><input type="checkbox" checked={account.fixed} onChange={(e) => touch({ fixed: e.target.checked })} title={t('ledger.fixedNote')} /> {t('ledger.fixed')}</label>
      )}{sp}
      <button onClick={() => touch({ active: !account.active })} disabled={locked}>
        {account.active ? t('common.disable') : t('common.enable')}
      </button>
      <IconButton icon="trash" label={t('common.delete')} onClick={remove} disabled={!deletable} />
      {!account.active && <span className="note">{sp}{t('common.inactive')}</span>}
      {locked && <div className="note">{t('ledger.noteLocked')}</div>}
      {!locked && !deletable && <div className="note">{t('ledger.noteInUse')}</div>}
      {!locked && account.role === 'card' && <div className="note">{t('ledger.noteCard')}</div>}
      {!locked && hasBudget(account, budgets) &&<div className="note">{t('ledger.noteBudget')}</div>}
      {error && <div className="error">{error}</div>}
    </>
  )
}

function AccountRow(props) {
  return <li className={props.account.active ? '' : 'inactive'}><AccountEditor {...props} /></li>
}

// スマホの幅（spec-mobile.md 第6章）：一覧には科目名と役割だけ。行を押すと、その科目の編集の欄が開く（開いているのは1つだけ）。閉じると、入力途中の名前は捨てる
function AccountCard({ open, onToggle, ...props }) {
  const { account } = props
  const detailId = `account-${account.id}`
  return (
    <li className={`acct${account.active ? '' : ' inactive'}${open ? ' open' : ''}`}>
      <button type="button" className="acct-toggle" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
        <span className="nm">{account.name}</span>
        {(account.type === 'asset' || account.type === 'liability') && <span className="role">{ROLE_LABELS[account.role]}</span>}
        {!account.active && <span className="role">{t('common.inactive')}</span>}
        <span className="mark"><Icon name={open ? 'chevDown' : 'chevRight'} /></span>
      </button>
      <div id={detailId} className="acct-detail" hidden={!open}>{open && <AccountEditor {...props} />}</div>
    </li>
  )
}

function AddForm({ accounts, onAdd }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('expense')
  const [role, setRole] = useState('cash')
  const [error, setError] = useState('')
  const gunjoPc = useGunjoPc()

  const submit = (e) => {
    e.preventDefault()
    const r = validateAccountName(name, accounts)
    if (r.error) return setError(r.error)
    setError('')
    onAdd(newAccount(r.name, type, type === 'asset' ? role : undefined)) // 負債は role が other になる（クレカは、クレカの画面から追加する）
    setName('')
  }

  return (
    <form onSubmit={submit}>
      <TypeSelect value={type} onChange={setType} />
      {type === 'asset' && <RoleSelect value={role} onChange={setRole} />}
      <input placeholder={t('ledger.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <button className={gunjoPc ? 'primary large' : undefined}><Icon name="plus" />{t('common.add')}</button>
      {error && <span className="error">{error}</span>}
    </form>
  )
}

export default function Ledger({ data, update }) {
  const { accounts, entries, subscriptions, budgets } = data
  const setAccounts = (next) => update({ ...data, accounts: next })
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const bandHost = useBandHost()
  const typeEn = { asset: t('typeEn.asset'), liability: t('typeEn.liability'), revenue: t('typeEn.revenue'), expense: t('typeEn.expense'), equity: t('typeEn.equity') }
  const [openId, setOpenId] = useState(null) // スマホの幅で開いている科目（1つだけ）
  // 科目を削除したときは、お気に入りからも外す（1回の update で。2回に分けると、古い data で上書きされる）
  const deleteAccount = (id) => update({ ...data, accounts: accounts.filter((x) => x.id !== id), settings: removeAccountFromSettings(data.settings, id) })

  // 群青の PC（見本 E-accounts）：画面の名前は帯のマス。帯に科目の件数。節の見出しは「資産 ASSETS」の形（見本は単数 ASSET。開始残高にそろえて複数）
  return (
    <div className={gunjoPc ? 'ledger g-accounts' : 'ledger'}>
      {bandHost && createPortal(<BandStat label={t('ledger.count')} value={accounts.length} unit={t('settings.countUnit')} />, bandHost)}
      {!gunjoPc && <h2>{t('ledger.title')}</h2>}
      <AddForm accounts={accounts} onAdd={(a) => setAccounts([...accounts, a])} />
      {TYPES.map((type) => (
        <section key={type}>
          {gunjoPc ? <h2 className="g-h">{TYPE_LABELS[type]}<small lang="en">{typeEn[type]}</small></h2> : <h3>{TYPE_LABELS[type]}</h3>}
          <ul className={phone ? 'accts' : ''}>
            {accounts.filter((a) => a.type === type).map((a) => {
              const props = {
                account: a,
                accounts,
                entries,
                subscriptions,
                budgets,
                onChange: (next) => setAccounts(accounts.map((x) => (x.id === a.id ? next : x))),
                onDelete: () => deleteAccount(a.id),
              }
              return phone
                ? <AccountCard key={a.id} {...props} open={openId === a.id} onToggle={() => setOpenId(openId === a.id ? null : a.id)} />
                : <AccountRow key={a.id} {...props} />
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
