import { formatYen, monthDay } from '../ledgerLogic.js'
import { t } from '../text.js'
import { useState } from 'react'
import { Icon } from './Icon.jsx'
import Tabs from './Tabs.jsx'
import { panelDomId, tabDomId } from '../tabs.js'

const PLAN_ICONS = { total: 'bag', next: 'wallet', end: 'ticket', installment: 'cart', revolving: 'wallet' } // スマホの絵（仕訳プリセットの絵から）
const monthLabel = (closingDate) => t('loans.monthLabel', { year: closingDate.slice(0, 4), month: Number(closingDate.slice(5, 7)) })

// 基本の PC：分割・リボの見やすさ。合計と割合の帯・次の引き落とし分・先の請求の月ごとの棒・買い物ごとの進み。overview は planView.js の planOverview の結果、money は金額の文字
// クレカの個別ページ（1 枚）と、借入のページの別枠（カードをまとめて。showCard で、買い物ごとにカード名を添える）の両方で使う
// phone：スマホ（縦に並べる）。foldItems：スマホで買い物ごとの残りを畳む（借入ページ）。畳まないスマホ（クレカ個別ページ）は、「先の請求の予定｜買い物ごとの残り」のタブで切り替える（初めは先の請求の予定）
export default function PlanOverview({ overview, money, showCard = false, phone = false, foldItems = false }) {
  const [tab, setTab] = useState('schedule')
  const { total, split, revo, bars, more, moreAmount, items, next, nextPayDate, recordPending, laterFrom, endClosing } = overview
  const max = Math.max(...bars.map((b) => b.split + b.revo), 1)
  const parts = [['split', 'plan.split', split], ['revo', 'plan.revolving', revo]]
  const legend = (list) => <ul className="b-plan-legend">{list.map(([key, label, amount]) => <li key={key}><span className={`b-plan-swatch b-plan-${key}`} aria-hidden="true" />{t(label)}{amount !== null && <strong>{money(amount)}</strong>}</li>)}</ul>
  const chart = (
    <div className="b-plan-box">
      {(!phone || foldItems) && <h4>{t('plan.chartTitle')}</h4>}
      <div className="b-plan-chart" role="img" aria-label={t('plan.chartTitle')}>
        {bars.map((b) => (
          <div key={b.month} className={`b-plan-col${b.dark ? ' dark' : ''}`}>
            <span className="v">{formatYen(b.split + b.revo)}</span>
            <span className="b-plan-stack" style={{ height: `${((b.split + b.revo) / max) * 100}%` }}>
              {b.revo > 0 && <span className="b-plan-revo" style={{ flex: b.revo }} />}
              {b.split > 0 && <span className="b-plan-split" style={{ flex: b.split }} />}
            </span>
            <span className="m">{t('plan.barMonth', { month: Number(b.month.slice(5)) })}</span>
          </div>
        ))}
      </div>
      {more > 0 && <p className="note">{phone ? t('plan.barMoreSum', { n: more, amount: money(moreAmount) }) : t('plan.barMore', { n: more })}</p>}
      {legend(parts.map(([key, label]) => [key, label, null]))}
    </div>
  )
  const list = (
    <ul className="b-plan-items">
      {items.map((i) => (
        <li key={i.id} className="b-plan-item">
          <div className="r1">
            {phone && <span className="ic"><Icon name={PLAN_ICONS[i.kind]} /></span>}
            <span className="nm"><span className="user-text">{i.kind === 'revolving' ? t('plan.revolving') : i.name}</span></span>
            {i.kind === 'installment' && <span className="tag">{t('plan.split')} {i.count}</span>}
            {i.kind === 'installment' && i.fallback && <span className="tag memo">{t('plan.noMemo')}</span>}
            {i.kind === 'revolving' && i.rate > 0 && <span className="tag">{t('loans.ratePerYear', { rate: String(i.rate / 100) })}</span>}
            {showCard && <span className="tag"><span className="user-text">{i.cardName}</span></span>}
            <b className="rem">{t('plan.remain', { amount: money(i.remaining) })}</b>
          </div>
          {i.kind === 'installment' && (
            <div className="pips" role="img" aria-label={t('plan.progressAria', { count: i.count, done: i.done })}>
              {Array.from({ length: i.count }, (_, n) => <i key={n} className={n < i.done ? 'done' : n === i.done ? 'next' : ''} />)}
            </div>
          )}
          <div className="r3">
            {i.kind === 'installment' && <span><b>{t('plan.progress', { count: i.count, done: i.done, left: i.left })}</b></span>}
            <span>{t('plan.monthly', { amount: money(i.monthly) })}</span>
            <span>{t('plan.until', { month: monthLabel(i.endClosing) })}</span>
          </div>
        </li>
      ))}
    </ul>
  )
  return (
    <section className={phone ? 'b-plan b-plan-phone' : 'b-plan'}>
      <div className="b-plan-tiles">
        <div className="b-plan-tile">
          <span className="lbl">{phone && <Icon name={PLAN_ICONS.total} />}{t('plan.total')}</span>
          <strong className="b-plan-big">{money(total)}</strong>
          <div className="b-plan-band">{parts.filter(([, , amount]) => amount > 0).map(([key, , amount]) => <span key={key} className={`b-plan-${key}`} style={{ flex: amount }} />)}</div>
          {legend(parts)}
        </div>
        <div className="b-plan-tile b-plan-nexttile">
          <span className="lbl">{phone && <Icon name={PLAN_ICONS.next} />}{t('plan.next', { date: nextPayDate ? monthDay(nextPayDate) : '' })}</span>
          <strong className="b-plan-mid">{money(next)}</strong>
          {recordPending && <span className="b-plan-pending">{t('card.recordPending')}</span>}
        </div>
        <div className="b-plan-tile">
          <span className="lbl">{phone && <Icon name={PLAN_ICONS.end} />}{t('plan.endLast')}</span>
          <strong className="b-plan-mid">{endClosing ? monthLabel(endClosing) : '—'}</strong>
        </div>
      </div>
      {!phone && <div className="b-plan-cols">{chart}<div className="b-plan-box"><h4>{t('plan.itemsTitle')}</h4>{list}</div></div>}
      {phone && foldItems && <>
        {chart}
        <details className="b-plan-fold">
          <summary><span>{t('plan.itemsFold', { n: items.length })}</span><Icon name="down" /></summary>
          {list}
        </details>
      </>}
      {phone && !foldItems && <>
        <Tabs prefix="plan-phone" label={t('plan.chartTitle')} tabs={[{ id: 'schedule', title: t('plan.tabSchedule') }, { id: 'items', title: t('plan.itemsTitle') }]} current={tab} onChange={setTab} />
        <div role="tabpanel" id={panelDomId('plan-phone', tab)} aria-labelledby={tabDomId('plan-phone', tab)}>{tab === 'schedule' ? chart : list}</div>
      </>}
      {!showCard && laterFrom && <p className="note">{t('card.laterNote', { date: monthDay(laterFrom) })}</p>}
    </section>
  )
}
