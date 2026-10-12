import './balance.css'
import { savingsHistory, formatYen, currencyUnit } from '../ledgerLogic.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

export default function Savings({ data }) {
  const { accounts, entries } = data
  const unit = currencyUnit(data.settings.currency)
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  const histories = savingsHistory(accounts, entries)
  const phone = usePhone()

  return (
    <div className="report">
      <h2>{t('savings.title')}</h2>
      {histories.length === 0 && <p className="note">{t('savings.noAccounts')}</p>}
      {histories.map((h) => (
        <section key={h.account.id}>
          <h3>{h.account.name}{t('common.colon')}<Num n={h.balance} />{unit}</h3>
          {h.rows.length === 0 ? <p className="note">{t('savings.noRecords')}</p> : phone ? (
            // スマホの幅（spec-mobile.md 第6章）：1件を2行。1行目に日付・相手の科目・「取り分け 15,000円」／「取り崩し 3,000円」、2行目にメモと累計。PC は下の表のまま
            <ul className="rows2">
              {h.rows.map(({ entry, delta, total }) => (
                <li key={entry.id}>
                  <span className="name">{entry.date} {name(entry.debitId === h.account.id ? entry.creditId : entry.debitId)}</span>
                  <span className="value">{delta < 0 ? t('savings.out') : t('savings.in')} {formatYen(Math.abs(delta))}{unit}</span>
                  <span className="sub">
                    {entry.memo && <span>{entry.memo}</span>}
                    <span>{t('savings.cumulative')} <Num n={total} />{unit}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="table-box"><table>
              <thead>
                <tr><th>{t('common.date')}</th><th>{t('common.otherAccount')}</th><th>{t('common.memo')}</th><th>{t('common.amount')}</th><th>{t('savings.cumulative')}</th></tr>
              </thead>
              <tbody>
                {h.rows.map(({ entry, delta, total }) => (
                  <tr key={entry.id}>
                    <td>{entry.date}</td>
                    <td className="wrap">{name(entry.debitId === h.account.id ? entry.creditId : entry.debitId)}</td>
                    <td className="wrap">{entry.memo}</td>
                    <td className={delta < 0 ? 'neg' : ''}>{delta > 0 ? '+' : ''}{formatYen(delta)}{unit}</td>
                    <td><Num n={total} />{unit}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      ))}
      <p className="note">{t('savings.note')}</p>
    </div>
  )
}
