import { t } from './text.js'

// レベルは常に整数（0〜500）で扱う。122 = 1.22。
const LEVEL_RE = /^(\d+)(?:\.(\d{1,2}))?$/

export function parseLevel(str) {
  const m = LEVEL_RE.exec(str.trim())
  if (!m) return { error: t('skill.errLevelFormat') }
  const level = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  if (level > 500) return { error: t('skill.errLevelRange') }
  return { level }
}

export const formatLevel = (n) => (n / 100).toFixed(2)

export function validateName(name, skills, selfId) {
  const n = name.trim()
  if (!n) return { error: t('skill.errNameEmpty') }
  if (skills.some((s) => s.id !== selfId && s.name === n)) return { error: t('skill.errNameDuplicate') }
  return { name: n }
}

export function newSkill(name, now = new Date().toISOString()) {
  return { id: crypto.randomUUID(), name, level: 0, descriptions: {}, levelHistory: [], createdAt: now, updatedAt: now }
}

// 値が変わらないときは同じ skill を返す（履歴も updatedAt も触らない）
export function changeLevel(skill, level, now = new Date().toISOString()) {
  if (skill.level === level) return skill
  return {
    ...skill,
    level,
    updatedAt: now,
    levelHistory: [...skill.levelHistory, { changedAt: now, from: skill.level, to: level }],
  }
}

// 説明文は descriptions[段階番号(0〜50)] = 文字列。段階 = level を10で割って切り捨て（1.45 → 14）
export const stageOf = (level) => Math.floor(level / 10)

// 現在の段階以下で、書かれている一番近い段階。なければ null
export function effectiveStage(skill) {
  for (let i = stageOf(skill.level); i >= 0; i--) if (skill.descriptions[i]) return i
  return null
}

export function effectiveDescription(skill) {
  const i = effectiveStage(skill)
  return i === null ? t('skill.noDescription') : skill.descriptions[i]
}

// 空文字なら削除（キーを消す）
export function setDescription(skill, stage, text, now = new Date().toISOString()) {
  const descriptions = { ...skill.descriptions }
  if (text.trim()) descriptions[stage] = text
  else delete descriptions[stage]
  return { ...skill, descriptions, updatedAt: now }
}
