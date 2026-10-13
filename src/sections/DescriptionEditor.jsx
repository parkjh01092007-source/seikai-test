import { useState } from 'react'
import { effectiveStage, stageOf, setDescription } from '../skillLogic.js'
import { t } from '../text.js'
import { Icon } from './Icon.jsx'

function Row({ stage, text, active, current, onSave }) {
  const [draft, setDraft] = useState(text)
  return (
    <li style={active ? { background: 'var(--color-mark-bg)' } : undefined}>
      <b>{(stage / 10).toFixed(1)}</b>
      {active && ` ${t('skills.activeMark')}`}
      {current && ` ${t('skills.currentStage')}`}
      <br />
      <textarea rows="2" cols="50" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <button onClick={() => onSave(draft)}><Icon name="check" />{t('common.save')}</button>
      <button onClick={() => { setDraft(''); onSave('') }}><Icon name="trash" />{t('common.delete')}</button>
    </li>
  )
}

export default function DescriptionEditor({ skill, onChange }) {
  const active = effectiveStage(skill)
  const current = stageOf(skill.level)
  return (
    <ol start="0" style={{ listStyle: 'none', padding: 0 }}>
      {Array.from({ length: 51 }, (_, i) => (
        <Row
          key={i}
          stage={i}
          text={skill.descriptions[i] ?? ''}
          active={i === active}
          current={i === current}
          onSave={(text) => onChange(setDescription(skill, i, text))}
        />
      ))}
    </ol>
  )
}
