// Deal calculators for My List strategies. Pure math, no I/O; every input is something the user can see and edit.
// Purchases are assumed to be cash (tax deed auctions require it; HUD investors usually close cash too).

export interface CalcInputs {
  /** after-repair value: what it sells or appraises for once fixed */
  arv: number;
  /** what you pay: winning bid, accepted offer or list price */
  price: number;
  repairs: number;
  /** % of price: title, recording, doc stamps */
  buyCostsPct: number;
  /** % of ARV: agent and seller closing costs */
  sellCostsPct: number;
  holdMonths: number;
  /** taxes, insurance, utilities while you own it */
  holdingMonthly: number;
  /** wholesale rule of thumb: 70 → offer up to 70% of ARV minus repairs */
  maoPct: number;
  assignmentFee: number;
  rentMonthly: number;
  /** taxes, insurance, management, maintenance, vacancy */
  expensesMonthly: number;
  /** cash-out refinance as % of ARV */
  refiLtvPct: number;
  ratePct: number;
  termYears: number;
}

export const DEFAULT_INPUTS: Omit<CalcInputs, "arv" | "price"> = {
  repairs: 0, buyCostsPct: 2, sellCostsPct: 8, holdMonths: 6, holdingMonthly: 0, maoPct: 70, assignmentFee: 10_000,
  rentMonthly: 0, expensesMonthly: 0, refiLtvPct: 75, ratePct: 7.5, termYears: 30,
};

const pct = (base: number, p: number) => (base * p) / 100;

/** Price + repairs + buying costs + holding costs */
export function cashIn(i: CalcInputs) {
  return i.price + i.repairs + pct(i.price, i.buyCostsPct) + i.holdMonths * i.holdingMonthly;
}

export function wholesale(i: CalcInputs) {
  const mao = pct(i.arv, i.maoPct) - i.repairs;
  return { mao, offer: mao - i.assignmentFee };
}

export function flip(i: CalcInputs) {
  const invested = cashIn(i);
  const profit = i.arv - pct(i.arv, i.sellCostsPct) - invested;
  return { invested, profit, roi: invested > 0 ? profit / invested : null };
}

/** Fixed-rate mortgage payment */
export function monthlyPayment(loan: number, ratePct: number, years: number) {
  const n = years * 12;
  const r = ratePct / 100 / 12;
  if (loan <= 0 || n <= 0) return 0;
  return r === 0 ? loan / n : (loan * r) / (1 - (1 + r) ** -n);
}

export function brrrr(i: CalcInputs) {
  const invested = cashIn(i);
  const loan = pct(i.arv, i.refiLtvPct);
  const cashLeft = invested - loan;
  const payment = monthlyPayment(loan, i.ratePct, i.termYears);
  const cashFlow = i.rentMonthly - i.expensesMonthly - payment;
  // All cash back out (or more): the return on cash left is unbounded, so report null
  return { invested, loan, cashLeft, payment, cashFlow, cashOnCash: cashLeft > 0 ? (cashFlow * 12) / cashLeft : null };
}

export function rental(i: CalcInputs) {
  const invested = cashIn(i);
  const cashFlow = i.rentMonthly - i.expensesMonthly;
  return { invested, cashFlow, capRate: invested > 0 ? (cashFlow * 12) / invested : null };
}
