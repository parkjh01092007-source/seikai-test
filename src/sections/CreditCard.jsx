import { useState } from 'react'
import { createPortal } from 'react-dom'
import './balance.css'
import './creditcard.css'
import CreditCardDetail from './CreditCardDetail.jsx'
import { cardReports, cardMonthTotal, addCard, previousMonth, formatYen, currencyUnit } from '../ledgerLogic.js'
import { cardLanes, paidInAdvance, periodStatus, nextPayLane, lanePos, previewLine, shortDate } from '../flowArt.js'
import { toHash } from '../route.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBasicPc } from '../basicPc.js'
import { useBasicPhone } from '../basicPhone.js'
import { useBandHost } from './bandHost.js'
import { BandStat, signedYen } from './PageBand.jsx'
import { Icon } from './Icon.jsx'
import { StateTag, EmptyCard } from './FlowParts.jsx'
import CardMiniLine from './CardMiniLine.jsx'
import CardCountdown from './CardCountdown.jsx'
import CardAdjust from './CardAdjust.jsx'
import EntrySheet from './EntrySheet.jsx'

const cardHash = (detailId) => toHash({ entry: 'ledger', tab: 'card', detailId }) // 一覧（null）／個別（カードの id）の # 。組み立ては route.js

const Num = ({ n }) => <span className={n < 0 ? 'neg' : ''}>{formatYen(n)}</span>

// カードを追加するときの線（群青の PC）：入れかけの締め日・引き落とし日から引く。半角の 1〜31 が両方そろうまで出さない。保存はしない
function AddPreview({ closing, pay, now }) {
  const pv = previewLine(closing, pay, now)
  if (!pv) return null
  const paid = pv.payDate <= now
  return (
    <div className="g-wide g-preview">
      <p className="note">{t('card.previewHint', { closing: closing.trim(), pay: pay.trim() })}</p>
      <CardMiniLine
        left={t('ledger.closingLabel', { date: shortDate(pv.closingDate, now) })}
        right={`${t('ledger.payLabel', { date: shortDate(pv.payDate, now) })}${paid ? '' : `　${t('card.payLeft', { n: pv.left })}`}`}
        pos={pv.pos}
        paid={paid}
      />
    </div>
  )
}

// カードの追加。入力は消さない（エラーのとき）。日は前後の空白を取って渡す（検証は addCard）
function AddCardForm({ data, update, now, onAdded }) {
  const [name, setName] = useState('')
  const [closing, setClosing] = useState('')
  const [pay, setPay] = useState('')
  const [error, setError] = useState('')
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()

  const submit = (e) => {
    e.preventDefault()
    const r = addCard(data.accounts, { name, closingDayText: closing.trim(), payDayText: pay.trim() })
    if (r.error) return setError(r.error)
    setError('')
    update({ ...data, accounts: r.accounts })
    setName('')
    setClosing('')
    setPay('')
    onAdded?.() // 基本スマホ：追加したら下から出るシートを閉じる
  }

  // 群青の PC（見本 E-card）：ラベルを上に付けた欄（カード名は幅いっぱい、日は2列）と、大きい決定のボタン。説明は呼ぶ側が札の中に置く
  if (gunjoPc) {
    return (
      <form className="card-form g-form" onSubmit={submit}>
        <label className="fl g-wide"><span className="lab">{t('card.name')}</span><input placeholder={t('card.name')} aria-label={t('card.name')} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="fl"><span className="lab">{t('card.closingDayLabel')}</span><input className="day" inputMode="numeric" aria-label={t('card.closingDay')} value={closing} onChange={(e) => setClosing(e.target.value)} /></label>
        <label className="fl"><span className="lab">{t('card.payDayLabel')}</span><input className="day" inputMode="numeric" aria-label={t('card.payDay')} value={pay} onChange={(e) => setPay(e.target.value)} /></label>
        <AddPreview closing={closing} pay={pay} now={now} />
        <button className="primary large g-wide"><Icon name="plus" />{t('card.add')}</button>
        {error && <span className="error g-wide">{error}</span>}
      </form>
    )
  }

  return (
    <>
    <form className="card-form" onSubmit={submit}>
      {basicPc ? <label className="b-field"><span>{t('card.name')}</span><input placeholder={t('card.name')} aria-label={t('card.name')} value={name} onChange={(e) => setName(e.target.value)} /></label> : <input placeholder={t('card.name')} aria-label={t('card.name')} value={name} onChange={(e) => setName(e.target.value)} />}
      <label>{t('card.closingDay')}{' '}<input className="day" inputMode="numeric" aria-label={t('card.closingDay')} value={closing} onChange={(e) => setClosing(e.target.value)} />{' '}{t('card.dayUnit')}</label>
      <label>{t('card.payDay')}{' '}<input className="day" inputMode="numeric" aria-label={t('card.payDay')} value={pay} onChange={(e) => setPay(e.target.value)} />{' '}{t('card.dayUnit')}</label>
      <button className={basicPc ? 'b-primary' : undefined}><Icon name="plus" />{t('card.add')}</button>
      {error && <span className="error">{error}</span>}
    </form>
    <p className="note">{t('card.closingDayHint')}</p>
    </>
  )
}

// 群青の PC の一覧のカード 1 枚（見本 E24）：全体がリンク。名前・次の引き落とし分・線・今期の利用（文字だけ）・右端の札（次の引き落とし分の状態：確定／引き落とし済み）
function CardTile({ report: r, now, unit }) {
  const lanes = cardLanes(r, now, 3)
  const last = lanes.find((l) => l.closingDate === r.lastClosing) // 次の引き落とし分の期
  const open = lanes.find((l) => l.open)
  const paid = periodStatus(last) === 'paid'
  const ahead = paidInAdvance(r, now) // 引き落としの返済を先に記録ずみ（次の引き落とし分が 0）：1 行の説明
  return (
    <li>
      <a className={`card-button g-cardtile${r.account.active ? '' : ' inactive'}`} href={cardHash(r.account.id)}>
        <span className="g-ct-head">
          <span className="user-text">{r.account.name}{!r.account.active && t('common.inactive')}</span>
          <span className="amount">{t('card.next')}{' '}<b className={r.next < 0 ? 'neg' : ''}>{signedYen(r.next, formatYen)}{unit}</b></span>
        </span>
        <CardMiniLine
          left={t('ledger.closingLabel', { date: shortDate(r.lastClosing, now) })}
          right={`${t('ledger.payLabel', { date: shortDate(r.payDate, now) })}${paid ? '' : `　${t('card.payLeft', { n: last.left })}`}`}
          pos={lanePos(last, now)}
          paid={paid}
        />
        <span className="g-sub-row">
          {ahead && <span className="g-paid-note">{t('card.paidAhead')}</span>}
          {open.amount > 0 && <span>{t('card.periodUsage', { amount: `${formatYen(open.amount)}${unit}` })}</span>}
          <span className="g-sub-tag">
            {paid ? <StateTag tone="stamp" title={t('card.statusPaidHint')}>{t('card.statusPaid')}</StateTag> : <StateTag tone="live">{t('card.statusClosed')}</StateTag>}
          </span>
        </span>
      </a>
    </li>
  )
}

// detailId は # から来る（App が渡す）。null なら一覧
export default function CreditCard({ data, update, detailId = null }) {
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()
  const basicPhone = useBasicPhone()
  const bandHost = useBandHost()
  const [adding, setAdding] = useState(false) // 基本スマホ：「カード追加」の下から出るシート
  const [formOpen, setFormOpen] = useState(false) // 群青の PC：「カードを追加」の札を開いているか（カードが 0 枚のときは、いつも開く）
  if ((gunjoPc || basicPc || basicPhone) && detailId === 'adjust') return <CardAdjust data={data} update={update} /> // 既存の URL と処理を使い、基本 PC・基本スマホにも表示する。ほかのテーマ・群青スマホは従来どおり
  const now = today()
  const unit = currencyUnit(data.settings.currency)
  const reports = cardReports(data.accounts, data.entries, now)
  const selected = detailId === null ? undefined : reports.find((r) => r.account.id === detailId)

  // カードが消えたら（削除など）selected が見つからないので、一覧に戻る（# の書き換えは App がする）
  if (selected) {
    return (
      <div className={gunjoPc ? 'report g-rep' : basicPc ? 'report b-page b-card-detail' : basicPhone ? 'report b-phone-p2 b-phone-card-detail' : 'report'}>
        <CreditCardDetail card={selected} backHref={cardHash(null)} unit={unit} entries={data.entries} data={data} update={update} />
      </div>
    )
  }

  const thisMonth = cardMonthTotal(data.accounts, data.entries, now.slice(0, 7))
  const lastMonth = cardMonthTotal(data.accounts, data.entries, previousMonth(now))

  if (gunjoPc) {
    // 見本 E24：左の列（--g-sw）に、カードの札・追加の札（<details>。カードが 0 枚のときだけ開く）。右は青い面に「引き落としまで あと N 日」
    const empty = reports.length === 0
    const ordered = [...reports.filter((r) => r.account.active), ...reports.filter((r) => !r.account.active)] // 使わない設定のカードは、最後
    const next = nextPayLane(reports, now)
    return (
      <div className="report g-rep g-card-list g-cardpage">
        {bandHost && createPortal(<>
          <BandStat label={t('card.thisMonthHero', { month: thisMonth.month })} value={signedYen(thisMonth.amount, formatYen)} unit={unit} />
          <BandStat label={t('card.lastMonthHero', { month: lastMonth.month })} value={signedYen(lastMonth.amount, formatYen)} unit={unit} />
        </>, bandHost)}
        <div className="g-card-col">
          <section>
            <h2 className="g-h">{t('card.listTitle')}<small lang="en">{t('card.listEn')}</small></h2>
            {empty ? <EmptyCard title={t('card.emptyTitle')}>{t('card.emptyBody')}</EmptyCard> : (
              <ul className="cards g-cards">
                {ordered.map((r) => <CardTile key={r.account.id} report={r} now={now} unit={unit} />)}
              </ul>
            )}
            <p className="note">{t('card.totalNote')}</p>
          </section>
          <div className="g-addrow">
            <details
              className={`g-card g-new g-addcard${empty ? ' fixed' : ''}`}
              open={empty || formOpen}
              onToggle={(e) => { if (!empty) setFormOpen(e.currentTarget.open) }}
            >
              <summary onClick={empty ? (e) => e.preventDefault() : undefined}>
                <h2 className="g-h">{t('card.add')}<small lang="en">{t('card.addEn')}</small></h2>
              </summary>
              <div className="g-new-body">
                <AddCardForm data={data} update={update} now={now} />
                <p className="note">{t('card.closingDayHint')} {t('card.newNote')}</p>
              </div>
            </details>
            <a className="g-card g-adjlink" href={cardHash('adjust')}>{t('cardAdjust.linkLabel')}<small lang="en">{t('cardAdjust.linkEn')}</small></a>
          </div>
        </div>
        {next && <CardCountdown next={next} today={now} unit={unit} />}
      </div>
    )
  }

  return (
    <div className={basicPc ? 'report b-page b-cards' : basicPhone ? 'report b-phone-p2 b-phone-cards' : 'report'}>
      {basicPc ? <div className="b-page-head"><h2>{t('card.title')}</h2><p>{t('basicPc.cardsLead')}</p><a className="b-card-adjust-link" href={cardHash('adjust')}>{t('cardAdjust.linkLabel')}</a></div> : <h2>{t('card.title')}</h2>}
      {basicPc ? <div className="b-section-head"><h3>{t('card.totalTitle')}</h3></div> : <h3>{t('card.totalTitle')}</h3>}
      <div className="table-box"><table>
        <tbody>
          <tr><td>{t('card.thisMonthRow', { month: thisMonth.month })}</td><td><Num n={thisMonth.amount} />{unit}</td></tr>
          <tr><td>{t('card.lastMonthRow', { month: lastMonth.month })}</td><td><Num n={lastMonth.amount} />{unit}</td></tr>
        </tbody>
      </table></div>
      <p className="note">{t('card.totalNote')}</p>
      {basicPc ? <div className="b-section-head"><h3>{t('card.listTitle')}</h3></div> : <h3>{t('card.listTitle')}</h3>}
      {reports.length === 0 ? <p className="note">{t('card.empty')}</p> : (
        <ul className="cards">
          {reports.map((r) => {
            const status = basicPhone ? periodStatus({ paid: r.payDate <= now }) : null
            return (
              <li key={r.account.id}>
                <a className={`card-button${r.account.active ? '' : ' inactive'}`} href={cardHash(r.account.id)}>
                  <span>{r.account.name}{!r.account.active && t('common.inactive')}</span>
                  <span className="amount">{t('card.next')}{' '}<Num n={r.next} />{unit}{(basicPc || basicPhone) && r.later > 0 && <span className="b-card-later">{t('card.later')}{' '}<Num n={r.later} />{unit}</span>}{basicPhone && <span className={`b-phone-state${status === 'paid' ? ' paid' : ''}`} title={status === 'paid' ? t('card.statusPaidHint') : undefined}>{status === 'paid' ? t('card.statusPaid') : t('card.statusClosed')}</span>}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
      {basicPhone ? (
        <>
          <div className="b-phone-card-actions">
            <a className="b-phone-card-action" href={cardHash('adjust')}>{t('cardAdjust.linkLabel')}</a>
            <button type="button" className="b-phone-card-action" onClick={() => setAdding(true)}><Icon name="plus" />{t('card.add')}</button>
          </div>
          {adding && (
            <div className="b-phone-entries b-phone-cards">
              <EntrySheet title={t('card.add')} onClose={() => setAdding(false)} onOutside={() => setAdding(false)}>
                <AddCardForm data={data} update={update} onAdded={() => setAdding(false)} />
                <p className="note">{t('card.newNote')}</p>
                <div className="sheet-actions"><button type="button" onClick={() => setAdding(false)}><Icon name="close" />{t('entries.sheetClose')}</button></div>
              </EntrySheet>
            </div>
          )}
        </>
      ) : (
        <>
          {basicPc ? <div className="b-section-head"><h3>{t('card.add')}</h3></div> : <h3>{t('card.add')}</h3>}
          <AddCardForm data={data} update={update} />
          <p className="note">{t('card.newNote')}</p>
        </>
      )}
    </div>
  )
}
