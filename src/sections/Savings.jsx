import { createPortal } from 'react-dom'
import './balance.css'
import { savingsHistory, formatYen, currencyUnit } from '../ledgerLogic.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBandHost } from './bandHost.js'
import { BandStat, signedYen } from './PageBand.jsx'

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

export default function Savings({ data }) {
  const { accounts, entries } = data
  const unit = currencyUnit(data.settings.currency)
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  const histories = savingsHistory(accounts, entries)
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const bandHost = useBandHost()

  // 群青の PC（見本 E-savings）：帯に取り分けの科目ごとの残高（最大3つ。残りは下の見出しに出る）。科目ごとに「科目名 EARMARK」と表。画面の名前は帯のマス
  if (gunjoPc) {
    return (
      <div className="report g-rep g-savings">
        {bandHost && createPortal(histories.slice(0, 3).map((h) => (
          <BandStat key={h.account.id} label={t('savings.heroLabel', { name: h.account.name })} value={signedYen(h.balance, formatYen)} unit={unit} />
        )), bandHost)}
        {histories.length === 0 && <p className="note">{t('savings.noAccounts')}</p>}
        {histories.map((h) => (
          <section key={h.account.id}>
            <h2 className="g-h"><span className="user-text">{h.account.name}</span><small lang="en">{t('savings.titleEn')}</small></h2>
            {h.rows.length === 0 ? <p className="note">{t('savings.noRecords')}</p> : (
              <div className="table-box"><table>
                <thead>
                  <tr><th>{t('common.date')}</th><th className="text">{t('common.otherAccount')}</th><th className="text">{t('common.memo')}</th><th>{t('common.amount')}</th><th>{t('savings.cumulative')}</th></tr>
                </thead>
                <tbody>
                  {h.rows.map(({ entry, delta, total }) => (
                    <tr key={entry.id}>
                      <td>{entry.date.replaceAll('-', '/')}</td>
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
