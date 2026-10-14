import { createContext, useContext } from 'react'

// 群青の PC の帯（PageBand）の、画面の要点を入れる場所（DOM の要素）。帯がないとき（群青の PC ではないとき）は null。
// 画面は、この場所へ createPortal で要点を入れる（帯の中身は、その画面のデータから出す。App は画面のデータを知らなくてよい）
export const BandHostContext = createContext(null)
export const useBandHost = () => useContext(BandHostContext)
