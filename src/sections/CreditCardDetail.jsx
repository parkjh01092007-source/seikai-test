import { periodRows, formatYen } from '../ledgerLogic.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

// 個別ページ。card は cardReports の1枚分。表示するだけ（計算・並べ替え・判定は ledgerLogic.js）
export default function CreditCardDetail({ card, backHref, unit }) {
  const periods = periodRows(card.periods, card.lastClosing, card.payDay)
  const phone = usePhone()
  return (
    <>
      <div className="back"><a href={backHref}>{t('card.back')}</a></div>
      <h2>{card.account.name}{!card.account.active && <span className="note"> {t('common.inactive')}</span>}</h2>
      <div className="table-box"><table>
        <tbody>
          <tr><td>{t('card.next')}</td><td><Num n={card.next} />{unit}</td></tr>
          <tr><td>{t('card.unbilled')}</td><td><Num n={card.unbilled} />{unit}</td></tr>
          <tr><td>{t('card.payDateApprox')}</td><td>{card.payDate}</td></tr>
          <tr><td>{t('card.balanceTotal')}</td><td><Num n={card.balance} />{unit}</td></tr>
          <tr><td>{t('card.closingDay')}</td><td>{t('card.everyMonthDay', { day: card.closingDay })}</td></tr>
          <tr><td>{t('card.payDay')}</td><td>{t('card.everyMonthDay', { day: card.payDay })}</td></tr>
        </tbody>
      </table></div>
      <p className="note">
        {t('card.noteFormula', { date: card.lastClosing })} {t('card.noteRules')}
      </p>
      <h3>{t('card.periodsTitle')}</h3>
      {periods.length === 0 ? <p className="note">{t('card.noUsage')}</p> : phone ? (
        // スマホの幅（spec-mobile.md 第6章）：請求期間ごとに2行。1行目に締め日と利用額、2行目に引き落とし予定日と（未確定）。PC は下の表のまま
        <ul className="rows2">
          {periods.map((p) => (
            <li key={p.closingDate} className={p.open ? 'open-period' : ''}>
              <span className="name">{p.label}</span>
              <span className="value"><Num n={p.amount} />{unit}</span>
              <span className="sub">{t('card.payLabelWrap', { label: p.payLabel })}{p.open && t('card.unconfirmed')}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="table-box"><table>
          <thead>
            <tr><th>{t('card.period')}</th><th>{t('card.usage')}</th></tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.closingDate} className={p.open ? 'open-period' : ''}>
                <td>{p.label}{p.open && t('card.unconfirmed')}</td>
                <td><Num n={p.amount} />{unit}{t('card.payLabelWrap', { label: p.payLabel })}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  )
}
