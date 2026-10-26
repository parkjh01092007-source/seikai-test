import { createPortal } from 'react-dom'
import './balance.css'
import { savingsHistory, formatYen, currencyUnit } from '../ledgerLogic.js'
import { roseAccounts, roseFirstMonth, goalCard } from '../savingsRose.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBandHost } from './bandHost.js'
import { BandStat, signedYen } from './PageBand.jsx'
import { HistRow, StateTag } from './FlowParts.jsx'
import SavingsGoalCard from './SavingsGoalCard.jsx'
import SavingsRose from './SavingsRose.jsx'

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

export default function Savings({ data }) {
  const { accounts, entries } = data
  const unit = currencyUnit(data.settings.currency)
  const name = (id) => accounts.find((a) => a.id === id)?.name ?? ''
  const histories = savingsHistory(accounts, entries)
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const bandHost = useBandHost()

  // 群青の PC（見本 E22-savings-rose）：左の列（.g-sv-col）に「今月の目標の札 → 科目ごとの表 → 注意書き → 鶏頭図の見かた」、右は青い面（SavingsRose。鶏頭図＋単月の棒グラフ）。
  // 面が狭い（幅 884px 未満の入れ物。gunjo-pc.css の @container）ときは、同じ部品が、表の下に全幅の青い札として出る。帯には取り分けの科目ごとの残高（最大3つ）。画面の名前は帯のマス
  if (gunjoPc) {
    const now = today()
    const acs = roseAccounts(accounts, entries)
    const first = roseFirstMonth(accounts, entries)
    const empty = first === null // 取り分けの記録が 1 件もない：同じ内容を 3 か所に出さず、右の鶏頭図の下の一文（roseEmptyHint）だけにする（案 A）
    const card = acs.length > 0 ? goalCard({ accounts, entries, budgets: data.budgets, month: now.slice(0, 7) }) : null
    return (
      <div className="report g-rep g-savings g-sv-page">
        {bandHost && createPortal(histories.slice(0, 3).map((h) => (
          <BandStat key={h.account.id} label={t('savings.heroLabel', { name: h.account.name })} value={signedYen(h.balance, formatYen)} unit={unit} />
        )), bandHost)}
        <div className="g-sv-col">
          {card && (!empty || card.total) && <SavingsGoalCard card={card} unit={unit} />}
          {histories.map((h) => (
            <section key={h.account.id}>
              <h2 className="g-h"><span className="user-text">{h.account.name}</span><small lang="en">{t('savings.titleEn')}</small></h2>
              {h.rows.length === 0 && !empty ? <p className="note">{t('savings.noRecords')}</p> : (
                <table className="g-hist">
                  <thead>
                    <tr><th>{t('common.date')}</th><th>{t('common.otherAccount')}</th><th>{t('common.memo')}</th><th /><th className="n">{t('common.amount')}</th><th className="n">{t('savings.cumulative')}</th></tr>
                  </thead>
                  <tbody>
                    {h.rows.map(({ entry, delta, total }) => (
                      <HistRow
                        key={entry.id}
                        date={entry.date.replaceAll('-', '/')}
                        cells={[<span className="user-text">{name(entry.debitId === h.account.id ? entry.creditId : entry.debitId)}</span>, <span className="user-text">{entry.memo}</span>]}
                        tag={entry.kind === 'normal' ? <StateTag tone={delta < 0 ? 'down' : 'up'}>{delta < 0 ? t('savings.out') : t('savings.in')}</StateTag> : null} // 開始残高・残高調整の行には、「取り分け／取り崩し」の札を付けない（通常の仕訳だけ。列は空のまま残す）
                        amount={`${delta > 0 ? '+' : ''}${formatYen(delta)}${unit}`}
                        tone={delta < 0 ? 'down' : 'up'}
                        after={<Num n={total} />}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
          <p className="note">{t('savings.note')}</p>
          {acs.length > 0 && (
            <details className="g-sv-aux">
              <summary>{t('savings.roseHelpTitle')} ▾</summary>
              <p className="note">{t('savings.roseHelpBody')}</p>
            </details>
          )}
        </div>
        <SavingsRose accounts={accounts} entries={entries} budgets={data.budgets} today={now} first={first} currency={data.settings.currency} unit={unit} noAccounts={acs.length === 0} />
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
