import { useLayoutEffect, useRef, useState } from 'react'

// 入れ物の幅（px）を測る。字を縮めずに実寸で描く SVG のため（クレカの時間軸・線）。入れ物が隠れている（display: none）間は 0
export function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => setWidth(Math.round(el.clientWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
