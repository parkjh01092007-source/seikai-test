import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import './opening.css'
import { groupByType, openingAccounts, openingInitial, planOpening, currencyUnit } from '../ledgerLogic.js'
import { today } from '../today.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import { usePhone } from '../layout.js'
import { useGunjoPc } from '../gunjoPc.js'
import { useBandHost } from './bandHost.js'
import { BandStat } from './PageBand.jsx'
import { Icon } from './Icon.jsx'

// 保存の知らせとエラー。読み上げで伝わるよう、場所は先に（空のまま）置き、押した方にだけ文を入れる
function Result({ where, place, error, message }) {
  const mine = where === place
  return (
    <>
      <span className="error" role="alert">{mine ? error : ''}</span>
      <span className="note" role="status">{mine ? message : ''}</span>
    </>
  )
}

export default function Opening({ data, update }) {
  const { accounts, entries } = data
  const confirm = useConfirm()
  const [initial] = useState(() => openingInitial(accounts, entries, today()))
  const [date, setDate] = useState(initial.date)
  const [texts, setTexts] = useState(initial.amounts)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const phone = usePhone()
  const gunjoPc = useGunjoPc()
  const bandHost = useBandHost()
  const [place, setPlace] = useState('bottom') // 押した保存ボタン（'top' か 'bottom'）。知らせとエラーは、その横に出す
  const pressed = useRef('bottom') // 押したボタン（クリックの直後の submit で読む）。入力欄で Enter を押したときは、最初のボタン

  // 保存ボタンは、スマホの幅では一番上と一番下の2か所（spec-mobile.md 第6章）。PC は一番下の1つ。どちらも同じ保存の処理
  const save = async (e) => {
    e.preventDefault()
    setPlace(pressed.current)
    setMessage('')
    const plan = planOpening(accounts, entries, date, texts)
    if (plan.error) return setError(plan.error) // 入力途中の内容は消さない
    setError('')
    if (!plan.created && !plan.updated && !plan.deleted) return setMessage(t('opening.noChange'))
    const warn = plan.earlier ? `${t('opening.earlierWarning', { count: plan.earlier.count, first: plan.earlier.first })}\n\n` : ''
    if (!(await confirm({ message: `${warn}${t('opening.confirm', { created: plan.created, updated: plan.updated, deleted: plan.deleted })}` }))) return
    update({ ...data, entries: plan.entries })
    setMessage(t('common.saved'))
  }

  // 群青の PC（見本 E-opening）：帯に開始日、説明は札、科目は左に資産・右に負債（と、その下に保存）。画面の名前は帯のマス。ほかの形は、下のまま
  if (gunjoPc) {
    const groups = groupByType(openingAccounts(accounts))
    const typeEn = { asset: t('typeEn.asset'), liability: t('typeEn.liability') }
    const section = (g) => (
      <section key={g.type}>
        <h2 className="g-h">{g.label}{typeEn[g.type] && <small lang="en">{typeEn[g.type]}</small>}</h2>
        {g.accounts.map((a) => (
          <label key={a.id} className="row">
            <span>{a.name}</span>
            <input inputMode="numeric" aria-label={a.name} value={texts[a.id] ?? ''} onChange={(e) => setTexts((prev) => ({ ...prev, [a.id]: e.target.value }))} />
            <span>{currencyUnit(data.settings.currency)}</span>
          </label>
        ))}
      </section>
    )
    return (
      <div className="opening g-opening">
        {bandHost && createPortal(<BandStat label={t('opening.date')} value={date ? date.replaceAll('-', '/') : '—'} />, bandHost)}
        <section className="g-card g-notes">
          <p className="note">{t('opening.noteEarmark')}</p>
          <p className="note">{t('opening.noteCard')}</p>
          <p className="note">{t('opening.noteEmpty')}</p>
        </section>
        <form className="g-form" onSubmit={save}>
          <label className="fl g-date"><span className="lab">{t('opening.date')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <div className="g-cols">
            <div>{groups.filter((g) => g.type === 'asset').map(section)}</div>
            <div>
              {groups.filter((g) => g.type !== 'asset').map(section)}
              <div className="g-actions">
                <button className="primary large"><Icon name="check" />{t('common.save')}</button>
                {error && <span className="error" role="alert">{error}</span>}
                {message && <span className="note" role="status">{message}</span>}
              </div>
            </div>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="opening">
      <h2>{t('opening.title')}</h2>
      <p className="note">{t('opening.noteEarmark')}</p>
      <p className="note">{t('opening.noteCard')}</p>
      <p className="note">{t('opening.noteEmpty')}</p>
      <form onSubmit={save}>
        {phone ? (
          // スマホの幅：開始日の右に、同じ行で上の保存ボタン。知らせ・エラーは、そのボタンの下（次の行いっぱいに）
          <div className="date-row">
            <label className="date">
              {t('opening.date')}{' '}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <button onClick={() => { pressed.current = 'top' }}><Icon name="check" />{t('common.save')}</button>
            <Result where="top" place={place} error={error} message={message} />
          </div>
        ) : (
          <label className="date">
            {t('opening.date')}{' '}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}
        {groupByType(openingAccounts(accounts)).map((g) => (
          <section key={g.type}>
            <h3>{g.label}</h3>
            {g.accounts.map((a) => (
              <label key={a.id} className="row">
                <span>{a.name}</span>
                <input
                  inputMode="numeric"
                  aria-label={a.name}
                  value={texts[a.id] ?? ''}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                />
                <span>{currencyUnit(data.settings.currency)}</span>
              </label>
            ))}
          </section>
        ))}
        {phone ? (
          <div className="save-bar">
            <button onClick={() => { pressed.current = 'bottom' }}><Icon name="check" />{t('common.save')}</button>
            <Result where="bottom" place={place} error={error} message={message} />
          </div>
        ) : (
          <>
            <button><Icon name="check" />{t('common.save')}</button>
            {error && <span className="error" role="alert">{error}</span>}
            {message && <span className="note" role="status">{message}</span>}
          </>
        )}
      </form>
    </div>
  )
}
