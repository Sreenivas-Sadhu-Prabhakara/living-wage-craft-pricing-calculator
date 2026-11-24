/* Living-wage craft pricing — pure costing module.
 *
 * No DOM, no network, no dependencies. Every function here takes plain values
 * and returns plain values, so the rules can be tested on their own
 * (see tests/pricing.test.js).
 *
 * The one idea this module exists to express: the maker's own hours are a
 * costed input. Price minus everything you paid out, divided by the hours you
 * worked, is the wage you are actually paying yourself — and that number is
 * the headline, not the margin.
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ *
   * INDICATIVE wage reference — the ONLY place a wage figure is written.
   *
   * These are placeholders so the benchmark field is never blank. They are
   * NOT authoritative and NOT legal advice. Statutory minimum wages are
   * fixed per region and per skill category and are revised regularly, so
   * every user must replace these with the figure in their own current
   * notification:
   *   India        — the minimum-wage notification of the State Government
   *                  labour department for the relevant scheduled employment
   *                  and skill category (or the central rate where it applies).
   *   Philippines  — the Wage Order of the Regional Tripartite Wages and
   *                  Productivity Board (DOLE) for the relevant region.
   * Rates are published as DAILY figures in both countries, which is why the
   * benchmark is entered as a daily wage plus the hours in a working day.
   * ------------------------------------------------------------------ */
  var INDICATIVE_WAGE_REFERENCE = {
    INR: {
      daily: 500,
      hoursPerDay: 8,
      authority: "your State Government minimum-wage notification"
    },
    PHP: {
      daily: 600,
      hoursPerDay: 8,
      authority: "your DOLE regional wage order"
    }
  };

  /* Craft-trade pricing conventions, also user-editable in the page.
   * Retail at twice wholesale is the long-standing craft practice that stops a
   * maker undercutting the shops that stock them. The export uplift is a
   * buffer for documentation, freight forwarding and currency movement. */
  var DEFAULT_RETAIL_MARKUP_PCT = 100;
  var DEFAULT_EXPORT_UPLIFT_PCT = 25;
  var DEFAULT_MARGIN_PCT = 20;

  var CURRENCIES = ["INR", "PHP"];

  /* ---------------- numeric helpers ---------------- */

  /* Anything unparseable, empty, null or non-finite becomes 0. */
  function num(v) {
    if (typeof v === "number") { return isFinite(v) ? v : 0; }
    if (v === null || v === undefined || v === "") { return 0; }
    var n = parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  /* Quantities, money and hours cannot be negative in the real world. */
  function nonNeg(v) {
    var n = num(v);
    return n < 0 ? 0 : n;
  }

  function clamp(v, lo, hi) {
    var n = num(v);
    if (n < lo) { return lo; }
    if (n > hi) { return hi; }
    return n;
  }

  /* Last line of defence: never let a non-finite value escape. */
  function fin(n) {
    return isFinite(n) ? n : 0;
  }

  function div(a, b) {
    return b > 0 ? fin(a / b) : 0;
  }

  /* ---------------- the model ---------------- */

  /* price(input) -> result
   *
   * Everything is computed for one batch (one lot, one firing, one dyeing run,
   * or a single piece with batchQty = 1) and then divided down to the unit.
   *
   * Rules, in order:
   *   1. Wastage grosses up materials only — offcuts, spoiled dye, broken
   *      beads. It never touches labour or overhead.
   *   2. Seconds reduce the SALEABLE units, not the materials: you bought
   *      material for the whole batch, so the batch cost spreads over the
   *      units you can actually sell.
   *   3. Monthly overhead is allocated across the batches you make in a month.
   *   4. The maker's own hours = making hours + the unpaid hours (sourcing,
   *      packing, market trips, messages, accounts) that never get counted.
   *      Those hours are costed at the target wage like any other input.
   *   5. The implied hourly rate = (revenue at the price you charge today
   *      minus everything you actually paid out) / your own hours. This is
   *      the wage you are paying yourself.
   *   6. The benchmark is whatever the user enters: a daily wage and the
   *      hours in their working day.
   */
  function price(input) {
    var i = input || {};

    /* --- normalised inputs --- */
    var batchQty = nonNeg(i.batchQty);
    var materialsCost = nonNeg(i.materialsCost);
    var wastagePct = nonNeg(i.wastagePct);
    var secondsPct = clamp(i.secondsPct, 0, 100);
    var hoursMaking = nonNeg(i.hoursMaking);
    var hoursUnpaid = nonNeg(i.hoursUnpaid);
    var targetWage = nonNeg(i.targetWage);
    var benchmarkDaily = nonNeg(i.benchmarkDaily);
    var benchmarkHoursPerDay = nonNeg(i.benchmarkHoursPerDay);
    var hiredLabour = nonNeg(i.hiredLabour);
    var overheadMonth = nonNeg(i.overheadMonth);
    var batchesPerMonth = nonNeg(i.batchesPerMonth);
    var currentPrice = nonNeg(i.currentPrice);
    /* A margin can legitimately be negative (a clearance sale), but below
     * -100% the price would go negative, which is not a thing. */
    var marginPct = Math.max(-100, num(i.marginPct));
    var retailMarkupPct = Math.max(-100, num(i.retailMarkupPct));
    var exportUpliftPct = Math.max(-100, num(i.exportUpliftPct));

    /* --- rule 1: wastage on materials only --- */
    var wastageAmount = fin(materialsCost * (wastagePct / 100));
    var materialsAfterWastage = fin(materialsCost + wastageAmount);

    /* --- rule 2: seconds cut the saleable units --- */
    var saleableUnits = fin(batchQty * (1 - secondsPct / 100));
    var secondsUnits = fin(batchQty - saleableUnits);
    var hasSaleableUnits = saleableUnits > 0;

    /* --- rule 3: overhead allocation --- */
    var hasOverheadAllocation = overheadMonth > 0 && batchesPerMonth > 0;
    var overheadPerBatch = div(overheadMonth, batchesPerMonth);

    /* --- rule 4: the maker's own time, costed --- */
    var makerHours = fin(hoursMaking + hoursUnpaid);
    var hasMakerHours = makerHours > 0;
    var makerPayAtTarget = fin(makerHours * targetWage);

    /* Cash cost = every rupee or peso that leaves the maker's hands.
     * It deliberately excludes the maker's own time. */
    var cashCostBatch = fin(materialsAfterWastage + hiredLabour + overheadPerBatch);
    var fullCostBatch = fin(cashCostBatch + makerPayAtTarget);

    var cashCostPerUnit = div(cashCostBatch, saleableUnits);
    var fullCostPerUnit = div(fullCostBatch, saleableUnits);

    /* --- rule 6: the benchmark the user supplied --- */
    var benchmarkHourly = div(benchmarkDaily, benchmarkHoursPerDay);
    var hasBenchmark = benchmarkHourly > 0;
    var daysOfWork = benchmarkHoursPerDay > 0 ? div(makerHours, benchmarkHoursPerDay) : null;

    /* --- rule 5: what the maker is really paying themselves --- */
    var revenueBatch = fin(currentPrice * saleableUnits);
    var leftForMaker = fin(revenueBatch - cashCostBatch);
    var impliedHourly = hasMakerHours ? fin(leftForMaker / makerHours) : null;

    var pctOfBenchmark = (hasBenchmark && impliedHourly !== null)
      ? fin((impliedHourly / benchmarkHourly) * 100)
      : null;

    var shortfallPerHour = 0;
    if (hasBenchmark && impliedHourly !== null && impliedHourly < benchmarkHourly) {
      shortfallPerHour = fin(benchmarkHourly - impliedHourly);
    }
    var shortfallPerBatch = fin(shortfallPerHour * makerHours);

    /* --- the fair prices --- */
    /* The price that would pay the benchmark wage for every hour, with no
     * margin on top: the floor below which the maker is subsidising the buyer. */
    var priceAtBenchmark = div(cashCostBatch + makerHours * benchmarkHourly, saleableUnits);
    var priceAtTargetWage = fullCostPerUnit;

    var priceWholesale = fin(fullCostPerUnit * (1 + marginPct / 100));
    var priceRetail = fin(priceWholesale * (1 + retailMarkupPct / 100));
    var priceExport = fin(priceWholesale * (1 + exportUpliftPct / 100));

    var gapPerUnit = fin(currentPrice - fullCostPerUnit);
    var upliftNeededPerUnit = priceAtBenchmark > currentPrice
      ? fin(priceAtBenchmark - currentPrice)
      : 0;

    /* Margin the maker is actually earning at today's price, after paying
     * themselves the target wage. Negative means the price is below full cost. */
    var realMarginPct = fullCostPerUnit > 0
      ? fin((currentPrice / fullCostPerUnit - 1) * 100)
      : null;

    /* --- the verdict, hardest fact first --- */
    var verdict;
    if (!hasMakerHours) {
      verdict = "no_hours";
    } else if (impliedHourly < 0) {
      verdict = "below_cash_cost";
    } else if (!hasBenchmark) {
      verdict = "no_benchmark";
    } else if (impliedHourly < benchmarkHourly) {
      verdict = "below_benchmark";
    } else {
      verdict = "at_or_above";
    }

    return {
      /* echoes of the normalised inputs */
      batchQty: batchQty,
      saleableUnits: saleableUnits,
      secondsUnits: secondsUnits,
      hasSaleableUnits: hasSaleableUnits,
      makerHours: makerHours,
      hasMakerHours: hasMakerHours,
      targetWage: targetWage,
      marginPct: marginPct,
      retailMarkupPct: retailMarkupPct,
      exportUpliftPct: exportUpliftPct,

      /* batch cost build-up */
      materialsCost: materialsCost,
      wastageAmount: wastageAmount,
      materialsAfterWastage: materialsAfterWastage,
      hiredLabour: hiredLabour,
      overheadPerBatch: overheadPerBatch,
      hasOverheadAllocation: hasOverheadAllocation,
      cashCostBatch: cashCostBatch,
      makerPayAtTarget: makerPayAtTarget,
      fullCostBatch: fullCostBatch,

      /* per unit */
      cashCostPerUnit: cashCostPerUnit,
      fullCostPerUnit: fullCostPerUnit,
      currentPrice: currentPrice,
      gapPerUnit: gapPerUnit,
      realMarginPct: realMarginPct,

      /* the reality check */
      benchmarkHourly: benchmarkHourly,
      hasBenchmark: hasBenchmark,
      daysOfWork: daysOfWork,
      revenueBatch: revenueBatch,
      leftForMaker: leftForMaker,
      impliedHourly: impliedHourly,
      pctOfBenchmark: pctOfBenchmark,
      shortfallPerHour: shortfallPerHour,
      shortfallPerBatch: shortfallPerBatch,
      upliftNeededPerUnit: upliftNeededPerUnit,
      targetBelowBenchmark: hasBenchmark && targetWage > 0 && targetWage < benchmarkHourly,

      /* fair prices, per unit */
      priceAtBenchmark: priceAtBenchmark,
      priceAtTargetWage: priceAtTargetWage,
      priceWholesale: priceWholesale,
      priceRetail: priceRetail,
      priceExport: priceExport,

      verdict: verdict
    };
  }

  var CraftPricing = {
    INDICATIVE_WAGE_REFERENCE: INDICATIVE_WAGE_REFERENCE,
    DEFAULT_RETAIL_MARKUP_PCT: DEFAULT_RETAIL_MARKUP_PCT,
    DEFAULT_EXPORT_UPLIFT_PCT: DEFAULT_EXPORT_UPLIFT_PCT,
    DEFAULT_MARGIN_PCT: DEFAULT_MARGIN_PCT,
    CURRENCIES: CURRENCIES,
    num: num,
    nonNeg: nonNeg,
    clamp: clamp,
    price: price
  };

  if (typeof module === "object" && module && module.exports) {
    module.exports = CraftPricing;
  } else {
    root.CraftPricing = CraftPricing;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
