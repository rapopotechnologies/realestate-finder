import { describe, expect, it } from "vitest";
import { DEFAULT_INPUTS, brrrr, flip, monthlyPayment, rental, wholesale, type CalcInputs } from "@/lib/calc";

const deal: CalcInputs = { ...DEFAULT_INPUTS, arv: 200_000, price: 100_000, repairs: 30_000, holdingMonthly: 500, rentMonthly: 1_800, expensesMonthly: 500 };

describe("deal calculators", () => {
  it("wholesale: 70% of ARV minus repairs, then the assignment fee", () => {
    expect(wholesale(deal)).toEqual({ mao: 110_000, offer: 100_000 });
  });

  it("flip: profit after selling costs, on all cash put in", () => {
    // in: 100k + 30k + 2k buy costs + 6 × 500 = 135k; out: 200k − 16k = 184k
    const r = flip(deal);
    expect(r.invested).toBe(135_000);
    expect(r.profit).toBe(49_000);
    expect(r.roi).toBeCloseTo(0.363, 3);
  });

  it("mortgage payment matches the standard formula", () => {
    expect(monthlyPayment(150_000, 7.5, 30)).toBeCloseTo(1048.82, 2);
    expect(monthlyPayment(120_000, 0, 30)).toBeCloseTo(333.33, 2);
  });

  it("BRRRR: refinance at 75% of ARV; all cash back means no cash-on-cash figure", () => {
    const r = brrrr(deal);
    expect(r.loan).toBe(150_000);
    expect(r.cashLeft).toBe(-15_000);
    expect(r.cashOnCash).toBeNull();
    expect(r.cashFlow).toBeCloseTo(1_800 - 500 - 1048.82, 2);
    const leftIn = brrrr({ ...deal, refiLtvPct: 60 });
    expect(leftIn.cashLeft).toBe(15_000);
    expect(leftIn.cashOnCash).toBeCloseTo((leftIn.cashFlow * 12) / 15_000, 6);
  });

  it("rental: cap rate on all-in cost", () => {
    const r = rental({ ...deal, holdingMonthly: 0 });
    expect(r.invested).toBe(132_000);
    expect(r.capRate).toBeCloseTo((1_300 * 12) / 132_000, 6);
  });
});
