import { useState } from 'react'
import { cardPayEntries, cardRepayEntries, payItemName, payMarkText, formatYen } from '../ledgerLogic.js'
import { t } from '../text.js'
import { Icon } from './Icon.jsx'
import PlanEntryEditor from './PlanEntryEditor.jsx'

// クレカ個別ページの「このカードの分割・リボの仕訳」（基本の PC・スマホ）。分割・リボの買い物（終わった分割も）と、そのカードの引き落としを、別の小見出しで新しい順に並べる。
// PC は、行の「直す」を押すと、その場で直す・消す（PlanEntryEditor）。スマホ（readOnly）は見るだけ。分割・リボの仕訳がなければ、何も出さない。card は cardReport の結果
export default function CardPayLedger({ card, data, update, unit, readOnly = false }) {
  const [openId, setOpenId] = useState(null)
  const buys = cardPayEntries(card, data.entries)
  if (buys.length === 0) return null
  const repays = cardRepayEntries(card, data.entries)
  const row = (entry, main, note) => {
    const open = openId === entry.id
    return <li key={entry.id} className={`b-pay-row${open ? ' open' : ''}`}>
      <div className="r1">
        <span className="d">{entry.date}</span>
        <span className="nm user-text">{main}</span>
        <b className="a">{formatYen(entry.amount)}{unit}</b>
        {!readOnly && <button type="button" className="edit" aria-expanded={open} onClick={() => setOpenId(open ? null : entry.id)}>{t(open ? 'plan.editClose' : 'plan.edit')}{!open && <Icon name="chevRight" />}</button>}
      </div>
      {note && <p className="r2">{note}</p>}
      {open && <div className="b-plan-editor"><PlanEntryEditor data={data} update={update} entryIds={[entry.id]} /></div>}
    </li>
  }
  return <section className="b-pay-ledger">
    <h3>{t('payLedger.title')}</h3>
    <h4>{t('payLedger.buys')}</h4>
    <ul className="b-pay-list">
      {buys.map(({ entry, count, done, counted }) => row(
        entry,
        <>{payItemName(entry, data.accounts).name}<span className="tag">{payMarkText(entry.pay)}</span></>,
        count !== null ? t('payLedger.progress', { count, done }) : counted ? null : t('payLedger.revolvingOff'),
      ))}
    </ul>
    {repays.length > 0 && <>
      <h4>{t('payLedger.repays')}</h4>
      <ul className="b-pay-list">{repays.map((entry) => row(entry, <span>{entry.memo}</span>, null))}</ul>
    </>}
    {readOnly && <p className="note">{t('payLedger.phoneViewOnly')}</p>}
  </section>
}
