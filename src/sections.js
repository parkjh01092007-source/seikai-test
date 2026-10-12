import Skills from './sections/Skills.jsx'
import Ledger from './sections/Ledger.jsx'
import Entries from './sections/Entries.jsx'
import Opening from './sections/Opening.jsx'
import Adjustment from './sections/Adjustment.jsx'
import Subscriptions from './sections/Subscriptions.jsx'
import Balance from './sections/Balance.jsx'
import CreditCard from './sections/CreditCard.jsx'
import Savings from './sections/Savings.jsx'
import Monthly from './sections/Monthly.jsx'
import LedgerBook from './sections/LedgerBook.jsx'
import Budgets from './sections/Budgets.jsx'
import Settings from './sections/Settings.jsx'

// タブの id → 画面の部品。入口・グループ・タブの並びと文言は nav.js（画面の定義）にある。タブを足すときは、nav.js と、ここに1行ずつ足す。
export const screens = {
  skills: Skills,
  entries: Entries,
  subscriptions: Subscriptions,
  opening: Opening,
  adjustment: Adjustment,
  balance: Balance,
  monthly: Monthly,
  book: LedgerBook,
  card: CreditCard,
  savings: Savings,
  budgets: Budgets,
  accounts: Ledger,
  settings: Settings,
}
