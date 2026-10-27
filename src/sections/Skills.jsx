import { useState } from 'react'
import { createPortal } from 'react-dom'
import DescriptionEditor from './DescriptionEditor.jsx'
import { parseLevel, formatLevel, effectiveDescription, validateName, newSkill, changeLevel } from '../skillLogic.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import './skills.css'
import { Icon, IconButton } from './Icon.jsx'
import { useGunjoPc } from '../gunjoPc.js'
import { useBasicPc } from '../basicPc.js'
import { useBasicPhone } from '../basicPhone.js'
import { useBandHost } from './bandHost.js'
import { BandStat } from './PageBand.jsx'

function SkillRow({ skill, skills, onChange, onDelete }) {
  const [name, setName] = useState(skill.name)
  const [level, setLevel] = useState(formatLevel(skill.level))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const confirm = useConfirm()
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()

  const saveName = () => {
    const r = validateName(name, skills, skill.id)
    if (r.error) return setError(r.error)
    setError('')
    if (r.name !== skill.name) onChange({ ...skill, name: r.name, updatedAt: new Date().toISOString() })
    setName(r.name)
  }

  const saveLevel = () => {
    const r = parseLevel(level)
    if (r.error) return setError(r.error)
    setError('')
    onChange(changeLevel(skill, r.level))
    setLevel(formatLevel(r.level))
  }

  const remove = async () => {
    if (await confirm({ message: t('skills.deleteConfirm', { name: skill.name }) })) onDelete()
  }

  return (
    <li className={basicPc ? 'skill-row b-skill-row' : 'skill-row'}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={saveName}>{t('common.rename')}</button>
      {gunjoPc || basicPc ? <span className="lv">{t('skills.level')}</span> : <>{' '}{t('skills.level')}{' '}</>}<input size="5" inputMode="decimal" value={level} onChange={(e) => setLevel(e.target.value)} />
      <button onClick={saveLevel}>{t('skills.changeLevel')}</button>
      <IconButton icon="trash" label={t('common.delete')} onClick={remove} />
      <div>{t('skills.currentLevel', { level: formatLevel(skill.level) })}</div>
      <div>{t('skills.descriptionLine', { text: effectiveDescription(skill) })}</div>
      <button onClick={() => setEditing(!editing)}>{editing ? t('skills.closeDescription') : t('skills.editDescription')}</button>
      {editing && <DescriptionEditor skill={skill} onChange={onChange} />}
      {error && <div style={{ color: 'var(--color-error)' }}>{error}</div>}
    </li>
  )
}

export default function Skills({ data, update }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const setSkills = (skills) => update({ ...data, skills })
  const gunjoPc = useGunjoPc()
  const basicPc = useBasicPc()
  const basicPhone = useBasicPhone()
  const bandHost = useBandHost()

  const add = (e) => {
    e.preventDefault()
    const r = validateName(name, data.skills)
    if (r.error) return setError(r.error)
    setError('')
    setSkills([...data.skills, newSkill(r.name)])
    setName('')
  }

  // 群青の PC（見本 E-skills）：帯に登録の件数、「スキルを追加 NEW」の札、スキルごとの札。スキルの画面は AI の作業で作り直す予定なので、札と部品を当てるだけ（作りは今のまま）
  const addForm = (
    <form onSubmit={add}>
      <input placeholder={t('skills.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <button className={gunjoPc ? 'primary large' : basicPc ? 'b-primary' : undefined}><Icon name="plus" />{t('common.add')}</button>
      {error && <span style={{ color: 'var(--color-error)' }}>{gunjoPc ? '' : ' '}{error}</span>}
    </form>
  )
  const body = (
    <>
      {bandHost && createPortal(<BandStat label={t('skills.count')} value={data.skills.length} unit={t('settings.countUnit')} />, bandHost)}
      {gunjoPc ? (
        <section className="g-card g-skill-new">
          <h2 className="g-h">{t('skills.addTitle')}<small lang="en">{t('skills.addEn')}</small></h2>
          {addForm}
        </section>
      ) : basicPc ? (
        <section className="b-skill-new">
          <div className="b-section-head"><h3>{t('skills.addTitle')}</h3></div>
          {addForm}
        </section>
      ) : addForm}
      {basicPc && <div className="b-section-head"><h3>{t('basicPc.skillsList')}</h3><span className="note">{t('book.count', { count: data.skills.length })}</span></div>}
      <ul>
        {data.skills.map((s) => (
          <SkillRow
            key={s.id}
            skill={s}
            skills={data.skills}
            onChange={(next) => setSkills(data.skills.map((x) => (x.id === s.id ? next : x)))}
            onDelete={() => setSkills(data.skills.filter((x) => x.id !== s.id))}
          />
        ))}
      </ul>
    </>
  )
  return gunjoPc ? <div className="g-skills">{body}</div> : basicPc ? (
    <div className="b-page b-skills">
      <div className="b-page-head"><h2>{t('nav.tab.skills')}</h2><p>{t('basicPc.homeDesc.skills')}</p></div>
      {body}
    </div>
  ) : basicPhone ? <div className="b-phone-skills">{body}</div> : body
}
