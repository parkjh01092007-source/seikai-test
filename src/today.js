// 今日のローカル日付（YYYY-MM-DD）。toISOString はUTCでずれるため使わない。純関数には、画面からこの値を渡す。
// セーブした日時用：ローカルの時差つきの ISO 形式（例 2026-10-10T08:30:12.345+09:00）。先頭10文字がローカルの日付。純関数には、画面からこの値を渡す。
export const nowLocal = () => {
  const d = new Date()
  const p = (n, width = 2) => String(n).padStart(width, '0')
  const offset = -d.getTimezoneOffset()
  const abs = Math.abs(offset)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}${offset >= 0 ? '+' : '-'}${p(Math.floor(abs / 60))}:${p(abs % 60)}`
}

export const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
