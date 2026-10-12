import { useState } from 'react'
import DescriptionEditor from './DescriptionEditor.jsx'
import { parseLevel, formatLevel, effectiveDescription, validateName, newSkill, changeLevel } from '../skillLogic.js'
import { t } from '../text.js'
import { useConfirm } from './ConfirmDialog.jsx'
import './skills.css'

function SkillRow({ skill, skills, onChange, onDelete }) {
  const [name, setName] = useState(skill.name)
  const [level, setLevel] = useState(formatLevel(skill.level))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const confirm = useConfirm()

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
    <li className="skill-row">
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button onClick={saveName}>{t('common.rename')}</button>
      {' '}{t('skills.level')}{' '}<input size="5" inputMode="decimal" value={level} onChange={(e) => setLevel(e.target.value)} />
      <button onClick={saveLevel}>{t('skills.changeLevel')}</button>
      <button onClick={remove}>{t('common.delete')}</button>
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

  const add = (e) => {
    e.preventDefault()
    const r = validateName(name, data.skills)
    if (r.error) return setError(r.error)
    setError('')
    setSkills([...data.skills, newSkill(r.name)])
    setName('')
  }

  return (
    <>
      <form onSubmit={add}>
        <input placeholder={t('skills.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <button>{t('common.add')}</button>
        {error && <span style={{ color: 'var(--color-error)' }}> {error}</span>}
      </form>
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
}
