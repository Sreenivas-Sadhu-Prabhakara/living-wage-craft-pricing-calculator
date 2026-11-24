/* Table-driven tests for the pure costing module.
 *
 *   node tests/pricing.test.js
 *
 * No test framework, no dependencies. Every expected figure below was worked
 * out by hand from the stated rule; the per-unit divisions are written as the
 * division they are so the arithmetic stays readable.
 */
"use strict";

var P = require("../assets/pricing.js");

var pass = 0;
var fail = 0;
var failures = [];

function near(a, b) {
  if (typeof a !== "number" || typeof b !== "number") { return false; }
  if (!isFinite(a) || !isFinite(b)) { return a === b; }
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

function same(actual, expected) {
  if (expected === null) { return actual === null; }
  if (typeof expected === "number") { return near(actual, expected); }
  return actual === expected;
}

function show(v) {
  if (v === null) { return "null"; }
  if (typeof v === "number") { return String(Math.round(v * 1e6) / 1e6); }
  return String(v);
}

function check(label, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  failures.push(label + (detail ? "  — " + detail : ""));
}

/* Every numeric field of every result must be finite. A calculator that
 * renders NaN or Infinity is worse than no calculator. */
var NULLABLE = ["impliedHourly", "pctOfBenchmark", "daysOfWork", "realMarginPct"];

function assertAllFinite(label, r) {
  Object.keys(r).forEach(function (k) {
    var v = r[k];
    if (v === null && NULLABLE.indexOf(k) >= 0) { return; }
    if (typeof v === "number") {
      check(label + " / finite:" + k, isFinite(v), "got " + v);
    }
  });
}

/* Invariants that must hold for every single case. */
function assertInvariants(label, r) {
  check(label + " / inv: full = cash + maker pay",
    near(r.fullCostBatch, r.cashCostBatch + r.makerPayAtTarget));
  check(label + " / inv: materials after wastage",
    near(r.materialsAfterWastage, r.materialsCost + r.wastageAmount));
  check(label + " / inv: saleable + seconds = batch",
    near(r.saleableUnits + r.secondsUnits, r.batchQty));
  if (r.hasSaleableUnits) {
    check(label + " / inv: per-unit scales back to batch",
      near(r.fullCostPerUnit * r.saleableUnits, r.fullCostBatch));
  } else {
    check(label + " / inv: no saleable units -> per-unit 0",
      r.fullCostPerUnit === 0 && r.cashCostPerUnit === 0 && r.priceAtBenchmark === 0);
  }
  if (r.hasMakerHours) {
    check(label + " / inv: implied rate = left for maker / hours",
      near(r.impliedHourly * r.makerHours, r.leftForMaker));
  } else {
    check(label + " / inv: no hours -> implied rate is null",
      r.impliedHourly === null);
  }
  /* The shortfall against the benchmark, spread over the saleable units, is
   * exactly the price increase needed to reach the benchmark. */
  if (r.hasBenchmark && r.hasMakerHours && r.hasSaleableUnits &&
      r.impliedHourly < r.benchmarkHourly) {
    check(label + " / inv: shortfall per batch = uplift x units",
      near(r.shortfallPerBatch, r.upliftNeededPerUnit * r.saleableUnits),
      "shortfall " + show(r.shortfallPerBatch) + " vs " +
        show(r.upliftNeededPerUnit * r.saleableUnits));
  }
  /* A verdict is always one of the five known states. */
  check(label + " / inv: known verdict",
    ["no_hours", "below_cash_cost", "no_benchmark", "below_benchmark", "at_or_above"]
      .indexOf(r.verdict) >= 0, r.verdict);
}

/* ------------------------------------------------------------------ *
 * The base scenario: a maker of 12 pieces who believes she is doing fine.
 *   materials 1800 + 8% wastage      = 1944
 *   5% seconds on 12 units           = 11.4 saleable
 *   overhead 4000 / 4 batches        = 1000
 *   cash out of pocket               = 2944
 *   24 h making + 6 h unpaid         = 30 h
 *   benchmark 500/day over 8 h       = 62.50/h
 *   30 h at 62.50                    = 1875 of her own labour
 *   full cost of the batch           = 4819
 *   she sells at 350: 350 x 11.4     = 3990 revenue
 *   left to pay her                  = 3990 - 2944 = 1046 for 30 h
 *                                    = 34.8666.../h, well under 62.50
 * ------------------------------------------------------------------ */
var BASE = {
  batchQty: 12,
  materialsCost: 1800,
  wastagePct: 8,
  secondsPct: 5,
  hoursMaking: 24,
  hoursUnpaid: 6,
  targetWage: 62.5,
  benchmarkDaily: 500,
  benchmarkHoursPerDay: 8,
  hiredLabour: 0,
  overheadMonth: 4000,
  batchesPerMonth: 4,
  currentPrice: 350,
  marginPct: 20,
  retailMarkupPct: 100,
  exportUpliftPct: 25
};

/* A scenario with no repeating decimals, used for the boundary cases:
 *   10 units, no wastage, no seconds, no overhead allocation
 *   materials 1000, 10 h of work, benchmark 400/day over 8 h = 50/h
 *   at 150/unit: revenue 1500, cash 1000, 500 left for 10 h = exactly 50/h
 */
var CLEAN = {
  batchQty: 10,
  materialsCost: 1000,
  wastagePct: 0,
  secondsPct: 0,
  hoursMaking: 10,
  hoursUnpaid: 0,
  targetWage: 50,
  benchmarkDaily: 400,
  benchmarkHoursPerDay: 8,
  hiredLabour: 0,
  overheadMonth: 0,
  batchesPerMonth: 0,
  currentPrice: 150,
  marginPct: 20,
  retailMarkupPct: 100,
  exportUpliftPct: 25
};

function withBase(extra) { return Object.assign({}, BASE, extra); }
function withClean(extra) { return Object.assign({}, CLEAN, extra); }

var CASES = [
  {
    name: "base scenario — under-priced maker",
    input: BASE,
    expect: {
      wastageAmount: 144,
      materialsAfterWastage: 1944,
      saleableUnits: 11.4,
      overheadPerBatch: 1000,
      hasOverheadAllocation: true,
      makerHours: 30,
      makerPayAtTarget: 1875,
      cashCostBatch: 2944,
      fullCostBatch: 4819,
      cashCostPerUnit: 2944 / 11.4,
      fullCostPerUnit: 4819 / 11.4,
      benchmarkHourly: 62.5,
      daysOfWork: 3.75,
      revenueBatch: 3990,
      leftForMaker: 1046,
      impliedHourly: 1046 / 30,
      pctOfBenchmark: (1046 / 30) / 62.5 * 100,
      shortfallPerHour: 62.5 - 1046 / 30,
      shortfallPerBatch: 829,
      priceAtBenchmark: 4819 / 11.4,
      priceAtTargetWage: 4819 / 11.4,
      upliftNeededPerUnit: 4819 / 11.4 - 350,
      gapPerUnit: 350 - 4819 / 11.4,
      realMarginPct: (3990 / 4819 - 1) * 100,
      priceWholesale: (4819 / 11.4) * 1.2,
      priceRetail: (4819 / 11.4) * 1.2 * 2,
      priceExport: (4819 / 11.4) * 1.2 * 1.25,
      targetBelowBenchmark: false,
      verdict: "below_benchmark"
    }
  },

  /* ---- zero hours ---- */
  {
    name: "zero hours — no hourly rate can exist",
    input: withBase({ hoursMaking: 0, hoursUnpaid: 0 }),
    expect: {
      makerHours: 0,
      hasMakerHours: false,
      makerPayAtTarget: 0,
      impliedHourly: null,
      pctOfBenchmark: null,
      shortfallPerHour: 0,
      shortfallPerBatch: 0,
      daysOfWork: 0,
      fullCostBatch: 2944,
      fullCostPerUnit: 2944 / 11.4,
      priceAtBenchmark: 2944 / 11.4,
      verdict: "no_hours"
    }
  },
  {
    name: "unpaid admin hours only still count as hours",
    input: withBase({ hoursMaking: 0, hoursUnpaid: 5 }),
    expect: {
      makerHours: 5,
      hasMakerHours: true,
      makerPayAtTarget: 312.5,
      impliedHourly: 1046 / 5,
      verdict: "at_or_above"
    }
  },

  /* ---- zero quantity ---- */
  {
    name: "zero quantity — nothing to sell, money already spent",
    input: withBase({ batchQty: 0 }),
    expect: {
      saleableUnits: 0,
      secondsUnits: 0,
      hasSaleableUnits: false,
      cashCostBatch: 2944,
      cashCostPerUnit: 0,
      fullCostPerUnit: 0,
      revenueBatch: 0,
      leftForMaker: -2944,
      impliedHourly: -2944 / 30,
      priceAtBenchmark: 0,
      priceWholesale: 0,
      priceRetail: 0,
      priceExport: 0,
      realMarginPct: null,
      verdict: "below_cash_cost"
    }
  },
  {
    name: "zero quantity and zero hours — no rate, no units",
    input: withBase({ batchQty: 0, hoursMaking: 0, hoursUnpaid: 0 }),
    expect: {
      impliedHourly: null,
      hasSaleableUnits: false,
      verdict: "no_hours"
    }
  },
  {
    name: "empty input object — everything zero, nothing broken",
    input: {},
    expect: {
      batchQty: 0,
      saleableUnits: 0,
      makerHours: 0,
      cashCostBatch: 0,
      fullCostBatch: 0,
      benchmarkHourly: 0,
      hasBenchmark: false,
      impliedHourly: null,
      daysOfWork: null,
      realMarginPct: null,
      priceWholesale: 0,
      verdict: "no_hours"
    }
  },
  {
    name: "no input at all behaves like an empty batch",
    input: undefined,
    expect: { verdict: "no_hours", fullCostBatch: 0, priceRetail: 0 }
  },

  /* ---- batch sizes ---- */
  {
    name: "batch of one — per unit equals per batch",
    input: {
      batchQty: 1, materialsCost: 2000, wastagePct: 0, secondsPct: 0,
      hoursMaking: 40, hoursUnpaid: 10, targetWage: 100,
      benchmarkDaily: 800, benchmarkHoursPerDay: 8,
      hiredLabour: 500, overheadMonth: 6000, batchesPerMonth: 2,
      currentPrice: 9000, marginPct: 0, retailMarkupPct: 100, exportUpliftPct: 25
    },
    expect: {
      saleableUnits: 1,
      overheadPerBatch: 3000,
      cashCostBatch: 5500,
      makerHours: 50,
      makerPayAtTarget: 5000,
      fullCostBatch: 10500,
      fullCostPerUnit: 10500,
      benchmarkHourly: 100,
      daysOfWork: 6.25,
      revenueBatch: 9000,
      leftForMaker: 3500,
      impliedHourly: 70,
      pctOfBenchmark: 70,
      shortfallPerHour: 30,
      shortfallPerBatch: 1500,
      priceAtBenchmark: 10500,
      upliftNeededPerUnit: 1500,
      priceWholesale: 10500,
      priceRetail: 21000,
      priceExport: 13125,
      gapPerUnit: -1500,
      realMarginPct: (9000 / 10500 - 1) * 100,
      verdict: "below_benchmark"
    }
  },
  {
    name: "larger batch spreads the same overhead thinner",
    input: withClean({ batchQty: 100, materialsCost: 10000, currentPrice: 150 }),
    expect: {
      saleableUnits: 100,
      cashCostBatch: 10000,
      cashCostPerUnit: 100,
      fullCostBatch: 10500,
      fullCostPerUnit: 105,
      revenueBatch: 15000,
      leftForMaker: 5000,
      impliedHourly: 500,
      verdict: "at_or_above"
    }
  },
  {
    name: "fractional batch quantity is honoured, not rounded",
    input: withClean({ batchQty: 2.5, currentPrice: 400 }),
    expect: {
      saleableUnits: 2.5,
      revenueBatch: 1000,
      leftForMaker: 0,
      impliedHourly: 0,
      cashCostPerUnit: 400,
      fullCostPerUnit: 600,
      verdict: "below_benchmark"
    }
  },

  /* ---- wastage ---- */
  {
    name: "zero wastage leaves materials untouched",
    input: withBase({ wastagePct: 0 }),
    expect: {
      wastageAmount: 0,
      materialsAfterWastage: 1800,
      cashCostBatch: 2800,
      fullCostBatch: 4675
    }
  },
  {
    name: "50% wastage grosses up materials only",
    input: withClean({ wastagePct: 50 }),
    expect: {
      wastageAmount: 500,
      materialsAfterWastage: 1500,
      cashCostBatch: 1500,
      makerPayAtTarget: 500,
      fullCostBatch: 2000,
      fullCostPerUnit: 200
    }
  },
  {
    name: "wastage does not touch hired labour or overhead",
    input: withClean({ wastagePct: 100, hiredLabour: 300, overheadMonth: 800, batchesPerMonth: 4 }),
    expect: {
      materialsAfterWastage: 2000,
      hiredLabour: 300,
      overheadPerBatch: 200,
      cashCostBatch: 2500
    }
  },
  {
    name: "negative wastage is clamped to zero",
    input: withClean({ wastagePct: -25 }),
    expect: { wastageAmount: 0, materialsAfterWastage: 1000 }
  },

  /* ---- seconds / breakage ---- */
  {
    name: "seconds reduce saleable units, not materials",
    input: withClean({ secondsPct: 20, currentPrice: 200 }),
    expect: {
      batchQty: 10,
      saleableUnits: 8,
      secondsUnits: 2,
      materialsAfterWastage: 1000,
      cashCostPerUnit: 125,
      fullCostPerUnit: 187.5,
      revenueBatch: 1600,
      leftForMaker: 600,
      impliedHourly: 60,
      verdict: "at_or_above"
    }
  },
  {
    name: "100% seconds — whole batch lost",
    input: withClean({ secondsPct: 100 }),
    expect: {
      saleableUnits: 0,
      secondsUnits: 10,
      hasSaleableUnits: false,
      revenueBatch: 0,
      leftForMaker: -1000,
      impliedHourly: -100,
      priceAtBenchmark: 0,
      verdict: "below_cash_cost"
    }
  },
  {
    name: "seconds above 100% is clamped to 100%",
    input: withClean({ secondsPct: 150 }),
    expect: { saleableUnits: 0, secondsUnits: 10, hasSaleableUnits: false }
  },
  {
    name: "negative seconds is clamped to zero",
    input: withClean({ secondsPct: -40 }),
    expect: { saleableUnits: 10, secondsUnits: 0 }
  },

  /* ---- overhead allocation, divide-by-zero guards ---- */
  {
    name: "overhead with zero batches per month does not divide by zero",
    input: withClean({ overheadMonth: 5000, batchesPerMonth: 0 }),
    expect: {
      overheadPerBatch: 0,
      hasOverheadAllocation: false,
      cashCostBatch: 1000
    }
  },
  {
    name: "zero overhead over real batches allocates nothing",
    input: withClean({ overheadMonth: 0, batchesPerMonth: 4 }),
    expect: { overheadPerBatch: 0, hasOverheadAllocation: false }
  },
  {
    name: "overhead is split across the month's batches",
    input: withClean({ overheadMonth: 9000, batchesPerMonth: 3 }),
    expect: {
      overheadPerBatch: 3000,
      hasOverheadAllocation: true,
      cashCostBatch: 4000,
      fullCostBatch: 4500,
      fullCostPerUnit: 450
    }
  },

  /* ---- the benchmark comparison, including the boundary ---- */
  {
    name: "implied rate exactly on the benchmark counts as at or above",
    input: CLEAN,
    expect: {
      cashCostBatch: 1000,
      fullCostBatch: 1500,
      fullCostPerUnit: 150,
      benchmarkHourly: 50,
      revenueBatch: 1500,
      leftForMaker: 500,
      impliedHourly: 50,
      pctOfBenchmark: 100,
      shortfallPerHour: 0,
      shortfallPerBatch: 0,
      upliftNeededPerUnit: 0,
      priceAtBenchmark: 150,
      gapPerUnit: 0,
      realMarginPct: 0,
      priceWholesale: 180,
      priceRetail: 360,
      priceExport: 225,
      verdict: "at_or_above"
    }
  },
  {
    name: "comfortably above the benchmark",
    input: withClean({ currentPrice: 200 }),
    expect: {
      impliedHourly: 100,
      pctOfBenchmark: 200,
      shortfallPerHour: 0,
      gapPerUnit: 50,
      realMarginPct: (200 / 150 - 1) * 100,
      verdict: "at_or_above"
    }
  },
  {
    name: "a whisker below the benchmark is still below",
    input: withClean({ currentPrice: 149.9 }),
    expect: {
      impliedHourly: 49.9,
      shortfallPerHour: 0.1,
      shortfallPerBatch: 1,
      verdict: "below_benchmark"
    }
  },
  {
    name: "benchmark hours per day of zero leaves no benchmark",
    input: withClean({ benchmarkHoursPerDay: 0 }),
    expect: {
      benchmarkHourly: 0,
      hasBenchmark: false,
      daysOfWork: null,
      pctOfBenchmark: null,
      shortfallPerHour: 0,
      impliedHourly: 50,
      priceAtBenchmark: 100,
      verdict: "no_benchmark"
    }
  },
  {
    name: "benchmark daily wage of zero leaves no benchmark",
    input: withClean({ benchmarkDaily: 0 }),
    expect: {
      benchmarkHourly: 0,
      hasBenchmark: false,
      targetBelowBenchmark: false,
      verdict: "no_benchmark"
    }
  },
  {
    name: "below cash cost outranks a missing benchmark",
    input: withClean({ benchmarkDaily: 0, currentPrice: 50 }),
    expect: {
      revenueBatch: 500,
      leftForMaker: -500,
      impliedHourly: -50,
      verdict: "below_cash_cost"
    }
  },
  {
    name: "selling at zero — paying to work",
    input: withClean({ currentPrice: 0 }),
    expect: {
      revenueBatch: 0,
      leftForMaker: -1000,
      impliedHourly: -100,
      pctOfBenchmark: -200,
      shortfallPerHour: 150,
      shortfallPerBatch: 1500,
      upliftNeededPerUnit: 150,
      verdict: "below_cash_cost"
    }
  },
  {
    name: "target wage below the benchmark is flagged",
    input: withClean({ targetWage: 30 }),
    expect: {
      targetBelowBenchmark: true,
      makerPayAtTarget: 300,
      fullCostBatch: 1300,
      fullCostPerUnit: 130,
      priceAtBenchmark: 150,
      verdict: "at_or_above"
    }
  },
  {
    name: "target wage not yet set is not flagged as below benchmark",
    input: withClean({ targetWage: 0 }),
    expect: {
      targetBelowBenchmark: false,
      makerPayAtTarget: 0,
      fullCostBatch: 1000,
      fullCostPerUnit: 100,
      priceAtBenchmark: 150
    }
  },
  {
    name: "target wage above the benchmark is not flagged",
    input: withClean({ targetWage: 80 }),
    expect: {
      targetBelowBenchmark: false,
      makerPayAtTarget: 800,
      fullCostPerUnit: 180,
      priceAtBenchmark: 150
    }
  },

  /* ---- margins, including negative ---- */
  {
    name: "zero margin prices at full cost",
    input: withClean({ marginPct: 0 }),
    expect: { priceWholesale: 150, priceRetail: 300, priceExport: 187.5 }
  },
  {
    name: "negative margin prices below full cost",
    input: withClean({ marginPct: -20 }),
    expect: {
      marginPct: -20,
      priceWholesale: 120,
      priceRetail: 240,
      priceExport: 150
    }
  },
  {
    name: "margin of -100% gives away the work for nothing",
    input: withClean({ marginPct: -100 }),
    expect: { priceWholesale: 0, priceRetail: 0, priceExport: 0 }
  },
  {
    name: "margin below -100% is clamped so price never goes negative",
    input: withClean({ marginPct: -250 }),
    expect: { marginPct: -100, priceWholesale: 0, priceRetail: 0, priceExport: 0 }
  },
  {
    name: "retail markup of zero makes retail equal wholesale",
    input: withClean({ retailMarkupPct: 0 }),
    expect: { priceWholesale: 180, priceRetail: 180 }
  },
  {
    name: "negative retail markup is clamped at -100%",
    input: withClean({ retailMarkupPct: -400, exportUpliftPct: -400 }),
    expect: { retailMarkupPct: -100, exportUpliftPct: -100, priceRetail: 0, priceExport: 0 }
  },
  {
    name: "large margin still produces finite prices",
    input: withClean({ marginPct: 400, retailMarkupPct: 150, exportUpliftPct: 60 }),
    expect: { priceWholesale: 750, priceRetail: 1875, priceExport: 1200 }
  },

  /* ---- defensive input handling ---- */
  {
    name: "negative money and hours are clamped to zero",
    input: {
      batchQty: -3, materialsCost: -500, wastagePct: -5, secondsPct: -5,
      hoursMaking: -10, hoursUnpaid: -2, targetWage: -50,
      benchmarkDaily: -400, benchmarkHoursPerDay: -8,
      hiredLabour: -100, overheadMonth: -900, batchesPerMonth: -3,
      currentPrice: -200, marginPct: 20, retailMarkupPct: 100, exportUpliftPct: 25
    },
    expect: {
      batchQty: 0, materialsCost: 0, saleableUnits: 0, makerHours: 0,
      targetWage: 0, benchmarkHourly: 0, hiredLabour: 0, overheadPerBatch: 0,
      currentPrice: 0, cashCostBatch: 0, fullCostBatch: 0,
      impliedHourly: null, daysOfWork: null, verdict: "no_hours"
    }
  },
  {
    name: "numeric strings from form fields are parsed",
    input: {
      batchQty: "10", materialsCost: "1000", wastagePct: "0", secondsPct: "0",
      hoursMaking: "10", hoursUnpaid: "0", targetWage: "50",
      benchmarkDaily: "400", benchmarkHoursPerDay: "8",
      hiredLabour: "", overheadMonth: "", batchesPerMonth: "",
      currentPrice: "150", marginPct: "20", retailMarkupPct: "100", exportUpliftPct: "25"
    },
    expect: {
      cashCostBatch: 1000, fullCostBatch: 1500, impliedHourly: 50,
      benchmarkHourly: 50, priceWholesale: 180, verdict: "at_or_above"
    }
  },
  {
    name: "unparseable text is treated as zero",
    input: withClean({
      materialsCost: "abc", hoursMaking: "n/a", currentPrice: null,
      benchmarkDaily: undefined, batchQty: {}
    }),
    expect: {
      materialsCost: 0, makerHours: 0, currentPrice: 0, benchmarkHourly: 0,
      batchQty: 0, verdict: "no_hours"
    }
  },
  {
    name: "non-finite numbers are treated as zero",
    input: withClean({
      materialsCost: Infinity, hoursMaking: NaN, currentPrice: -Infinity
    }),
    expect: { materialsCost: 0, makerHours: 0, currentPrice: 0 }
  },
  {
    name: "very large inputs stay finite",
    input: {
      batchQty: 1e6, materialsCost: 1e9, wastagePct: 10, secondsPct: 1,
      hoursMaking: 1e4, hoursUnpaid: 1e3, targetWage: 500,
      benchmarkDaily: 4000, benchmarkHoursPerDay: 8,
      hiredLabour: 1e7, overheadMonth: 1e8, batchesPerMonth: 10,
      currentPrice: 2000, marginPct: 30, retailMarkupPct: 100, exportUpliftPct: 25
    },
    expect: {
      saleableUnits: 990000,
      materialsAfterWastage: 1.1e9,
      overheadPerBatch: 1e7,
      cashCostBatch: 1.1e9 + 1e7 + 1e7,
      makerHours: 11000,
      makerPayAtTarget: 5500000
    }
  }
];

/* ---- run the table ---- */
CASES.forEach(function (c) {
  var r;
  try {
    r = P.price(c.input);
  } catch (e) {
    fail++;
    failures.push(c.name + "  — threw: " + e.message);
    return;
  }
  Object.keys(c.expect).forEach(function (k) {
    check(c.name + " / " + k, same(r[k], c.expect[k]),
      "expected " + show(c.expect[k]) + ", got " + show(r[k]));
  });
  assertAllFinite(c.name, r);
  assertInvariants(c.name, r);
});

/* ---- helper table ---- */
var NUM_CASES = [
  ["number passes through", 12.5, 12.5],
  ["negative number passes through", -4, -4],
  ["numeric string", "1800", 1800],
  ["decimal string", "7.25", 7.25],
  ["string with trailing unit", "12kg", 12],
  ["empty string", "", 0],
  ["null", null, 0],
  ["undefined", undefined, 0],
  ["unparseable text", "abc", 0],
  ["NaN", NaN, 0],
  ["Infinity", Infinity, 0],
  ["-Infinity", -Infinity, 0],
  ["object", {}, 0],
  ["boolean true", true, 0]
];
NUM_CASES.forEach(function (c) {
  check("num: " + c[0], same(P.num(c[1]), c[2]),
    "expected " + show(c[2]) + ", got " + show(P.num(c[1])));
});

var NONNEG_CASES = [[5, 5], [0, 0], [-5, 0], ["-12.5", 0], ["", 0], [NaN, 0]];
NONNEG_CASES.forEach(function (c) {
  check("nonNeg: " + show(c[0]), same(P.nonNeg(c[0]), c[1]));
});

var CLAMP_CASES = [[50, 0, 100, 50], [-10, 0, 100, 0], [150, 0, 100, 100],
                   [0, 0, 100, 0], [100, 0, 100, 100], ["abc", 0, 100, 0]];
CLAMP_CASES.forEach(function (c) {
  check("clamp: " + show(c[0]), same(P.clamp(c[0], c[1], c[2]), c[3]));
});

/* ---- the wage reference must stay a single, clearly indicative place ---- */
P.CURRENCIES.forEach(function (cur) {
  var ref = P.INDICATIVE_WAGE_REFERENCE[cur];
  check("wage reference exists for " + cur, !!ref);
  check("wage reference " + cur + " daily is a positive number",
    typeof ref.daily === "number" && ref.daily > 0);
  check("wage reference " + cur + " hours per day is a positive number",
    typeof ref.hoursPerDay === "number" && ref.hoursPerDay > 0);
  check("wage reference " + cur + " names the issuing authority",
    typeof ref.authority === "string" && ref.authority.length > 10);
});
check("retail markup default is the craft keystone convention",
  P.DEFAULT_RETAIL_MARKUP_PCT === 100);
check("export uplift default is a documented buffer",
  P.DEFAULT_EXPORT_UPLIFT_PCT === 25);
check("margin default is a round starting point", P.DEFAULT_MARGIN_PCT === 20);

/* ---- a pure module must not reach for the world ---- */
var SRC = require("fs").readFileSync(
  require("path").join(__dirname, "..", "assets", "pricing.js"), "utf8");
[
  ["document", /\bdocument\b/],
  ["window", /\bwindow\b/],
  ["localStorage", /localStorage/],
  ["fetch", /\bfetch\s*\(/],
  ["XMLHttpRequest", /XMLHttpRequest/],
  ["eval", /\beval\s*\(/],
  ["new Function", /new\s+Function/],
  ["require", /\brequire\s*\(/],
  ["setTimeout", /setTimeout/],
  ["Date", /\bnew\s+Date\b/]
].forEach(function (c) {
  check("module source is free of " + c[0], !c[1].test(SRC));
});
check("module ran without a DOM", typeof document === "undefined");

/* ---- report ---- */
if (failures.length) {
  failures.forEach(function (f) { console.log("FAIL  " + f); });
}
console.log("");
console.log("cases:   " + CASES.length + " scenarios + " +
  (NUM_CASES.length + NONNEG_CASES.length + CLAMP_CASES.length) + " helper rows");
console.log("asserts: " + (pass + fail) + "   passed: " + pass + "   failed: " + fail);
console.log(fail === 0 ? "RESULT: PASS" : "RESULT: FAIL");
process.exit(fail === 0 ? 0 : 1);
