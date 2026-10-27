import { createPortal } from 'react-dom'
import { periodRows, formatYen } from '../ledgerLogic.js'
import { t } from '../text.js'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBasicPc } from '../basicPc.js'
import { useBasicPhone } from '../basicPhone.js'
import { useBandHost, useBandTop } from './bandHost.js'
import { BandStat, signedYen } from './PageBand.jsx'
import { Icon } from './Icon.jsx'
import { StateTag } from './FlowParts.jsx'
import CardTimeline from './CardTimeline.jsx'
import { paidInAdvance, periodStatus } from '../flowArt.js'
import { today } from '../today.js'

const PERIOD_ROWS = 6 // 請求期間の表に出す行（新しい順）。残りは「ほか N 期間」に畳む
const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

// 個別ページ。card は cardReports の1枚分。表示するだけ（計算・並べ替え・判定は ledgerLogic.js）
export default function CreditCardDetail({ card, backHref, unit }) {
  const periods = periodRows(card.periods, card.lastClosing, card.payDay)
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()
  const basicPhone = useBasicPhone()
  const bandHost = useBandHost()
  const bandTop = useBandTop()
  const now = today()
  // 群青の PC（見本 E24）：帯にカード名と「一覧へ戻る」。左の列（--g-sw）に、「次の引き落とし分」の札・項目の表・「計算のしかた」（畳む）・請求期間の表（状態の札つき。最大 6 行、残りは畳む）。右の青い面に、請求の時間軸
  if (gunjoPc) {
    const rows = periods.map((p) => ({ ...p, status: periodStatus({ open: p.open, paid: p.payDate <= now }) }))
    const shown = rows.slice(0, PERIOD_ROWS)
    const more = rows.slice(PERIOD_ROWS)
    const periodTable = (list, withHead) => (
      <div className="table-box"><table className="g-hist">
        <thead className={withHead ? undefined : 'g-sr'}>
          <tr><th className="text">{t('card.period')}</th><th><span className="g-sr">{t('card.statusColumn')}</span></th><th className="n">{t('card.usage')}</th><th className="n">{t('card.payColumn')}</th></tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.closingDate} className={p.open ? 'open' : undefined}>
              <td>{p.label}</td>
              <td>
                {p.status === 'paid' && <StateTag tone="stamp" title={t('card.statusPaidHint')}>{t('card.statusPaid')}</StateTag>}
                {p.status === 'closed' && <StateTag tone="live">{t('card.statusClosed')}</StateTag>}
              </td>
              <td className="n"><Num n={p.amount} />{unit}</td>
              <td className="n">{p.payLabel}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    )
    return (
      <div className="g-detail g-cardpage">
        {bandHost && createPortal(<BandStat label={t('card.heroLabel')} value={<span className="user-text">{card.account.name}{!card.account.active && ` ${t('common.inactive')}`}</span>} />, bandHost)}
        {bandTop && createPortal(<a className="g-back" href={backHref}><Icon name="back" />{t('card.back')}</a>, bandTop)}
        <div className="g-card-col g-detail-left">
          <section className="g-card g-next">
            <span>{t('card.next')}</span>
            <b className={card.next < 0 ? 'neg' : ''}>{signedYen(card.next, formatYen)}{unit}</b>
            {paidInAdvance(card, now) && <small className="g-next-note">{t('card.paidAhead')}</small>}
          </section>
          <div className="table-box"><table className="g-facts">
            <tbody>
              <tr><td>{t('card.unbilled')}</td><td><Num n={card.unbilled} />{unit}</td></tr>
              <tr><td>{t('card.payDateApprox')}</td><td>{card.payDate.replaceAll('-', '/')}</td></tr>
              <tr><td>{t('card.balanceTotal')}</td><td><Num n={card.balance} />{unit}</td></tr>
              <tr><td>{t('card.closingDay')}</td><td>{t('card.everyMonthDay', { day: card.closingDay })}</td></tr>
              <tr><td>{t('card.payDay')}</td><td>{t('card.everyMonthDay', { day: card.payDay })}</td></tr>
            </tbody>
          </table></div>
          <details className="aux g-calcfold">
            <summary>{t('card.calcFold')} ▾</summary>
            <p className="note">{t('card.noteFormula', { date: card.lastClosing })} {t('card.noteRules')}</p>
          </details>
          <h2 className="g-h">{t('card.periodsTitle')}<small lang="en">{t('card.periodsEn')}</small></h2>
          {periods.length === 0 ? <p className="note">{t('card.noUsage')}</p> : (
            <>
              {periodTable(shown, true)}
              {more.length > 0 && (
                <details className="aux g-more">
                  <summary>{t('card.periodsMore', { n: more.length })} ▾</summary>
                  {periodTable(more, false)}
                </details>
              )}
            </>
          )}
        </div>
        <CardTimeline card={card} today={now} unit={unit} />
      </div>
    )
  }
  return (
    <>
      <div className="back"><a href={backHref}>{t('card.back')}</a></div>
      {basicPc ? <div className="b-page-head"><h2>{card.account.name}{!card.account.active && <span className="note"> {t('common.inactive')}</span>}</h2><p>{t('basicPc.cardDetailLead')}</p></div> : <h2>{card.account.name}{!card.account.active && <span className="note"> {t('common.inactive')}</span>}</h2>}
      {basicPhone && <section className="b-phone-next"><span>{t('card.next')}</span><b><Num n={card.next} />{unit}</b></section>}
      <div className="table-box"><table>
        <tbody>
          {!basicPhone && <tr><td>{t('card.next')}</td><td><Num n={card.next} />{unit}</td></tr>}
          <tr><td>{t('card.unbilled')}</td><td><Num n={card.unbilled} />{unit}</td></tr>
          {!basicPhone && <tr><td>{t('card.payDateApprox')}</td><td>{card.payDate}</td></tr>}
          <tr><td>{t('card.balanceTotal')}</td><td><Num n={card.balance} />{unit}</td></tr>
          {!basicPhone && <tr><td>{t('card.closingDay')}</td><td>{t('card.everyMonthDay', { day: card.closingDay })}</td></tr>}
          {!basicPhone && <tr><td>{t('card.payDay')}</td><td>{t('card.everyMonthDay', { day: card.payDay })}</td></tr>}
        </tbody>
      </table></div>
      {basicPhone ? <details className="b-phone-calcfold"><summary>{t('card.calcFold')}</summary><p className="note">{t('card.noteFormula', { date: card.lastClosing })} {t('card.noteRules')}</p></details> : <p className="note">
        {t('card.noteFormula', { date: card.lastClosing })} {t('card.noteRules')}
      </p>}
      {basicPc ? <div className="b-section-head"><h3>{t('card.periodsTitle')}</h3></div> : <h3>{t('card.periodsTitle')}</h3>}
      {periods.length === 0 ? <p className="note">{t('card.noUsage')}</p> : phone ? (
        // スマホの幅（spec-mobile.md 第6章）：請求期間ごとに2行。1行目に締め日と利用額、2行目に引き落とし予定日と（未確定）。PC は下の表のまま
        <ul className="rows2">
          {periods.map((p) => {
            const status = basicPhone ? periodStatus({ open: p.open, paid: p.payDate <= now }) : null
            return (
              <li key={p.closingDate} className={p.open ? 'open-period' : ''}>
                <span className="name">{p.label}</span>
                <span className="value"><Num n={p.amount} />{unit}</span>
                <span className="sub">{t('card.payLabelWrap', { label: p.payLabel })}{p.open && t('card.unconfirmed')}{basicPhone && status !== 'open' && <span className={`b-phone-state${status === 'paid' ? ' paid' : ''}`} title={status === 'paid' ? t('card.statusPaidHint') : undefined}>{status === 'paid' ? t('card.statusPaid') : t('card.statusClosed')}</span>}</span>
              </li>
            )
          })}
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
