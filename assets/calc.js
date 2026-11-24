/* Living-wage craft pricing calculator — page wiring.
 * Reads the form, hands plain numbers to the pure costing module in
 * pricing.js, formats what comes back. No dependencies, no network.
 */
(function () {
  "use strict";

  var P = window.CraftPricing;

  var byId = function (id) { return document.getElementById(id); };

  var cur = "INR";                                  // INR | PHP
  var SYM = { INR: "₹", PHP: "₱" };
  var LOCALE = { INR: "en-IN", PHP: "en-PH" };

  /* Fields whose starting values come from the named constants in pricing.js,
   * never from markup, so there is one place to change them. Once the user
   * types in one of these it is theirs and is never overwritten. */
  var SEEDED = ["benchmarkDaily", "benchmarkHoursPerDay", "targetWage",
                "marginPct", "retailMarkupPct", "exportUpliftPct"];
  var CURRENCY_SEEDED = ["benchmarkDaily", "targetWage"];
  var dirty = {};

  var FIELDS = ["batchQty", "materialsCost", "wastagePct", "secondsPct",
                "hoursMaking", "hoursUnpaid", "targetWage", "benchmarkDaily",
                "benchmarkHoursPerDay", "hiredLabour", "overheadMonth",
                "batchesPerMonth", "currentPrice", "marginPct",
                "retailMarkupPct", "exportUpliftPct"];

  /* ---------------- formatting ---------------- */

  function fmt(n, code, digits) {
    if (!isFinite(n)) { n = 0; }
    try {
      return new Intl.NumberFormat(LOCALE[code], {
        style: "currency", currency: code,
        minimumFractionDigits: digits, maximumFractionDigits: digits
      }).format(n);
    } catch (e) {
      return SYM[code] + n.toFixed(digits);
    }
  }

  function money(n) { return fmt(n, cur, 2); }
  function money0(n, code) { return fmt(n, code || cur, 0); }

  /* Big headline figure: drop the paise once the number is long enough that
   * two decimals would push it out of a 360px card. */
  function bigMoney(n) {
    if (!isFinite(n)) { n = 0; }
    return fmt(n, cur, Math.abs(n) >= 100000 ? 0 : 2);
  }

  function trimNum(n, digits) {
    if (!isFinite(n)) { n = 0; }
    var s = n.toFixed(digits);
    if (s.indexOf(".") >= 0) { s = s.replace(/0+$/, "").replace(/\.$/, ""); }
    return s;
  }

  function pct(n) { return isFinite(n) ? trimNum(n, 1) + "%" : "—"; }

  /* "plus 20%" / "less 20%" — never "plus -20%". */
  function signedPct(n) {
    if (!isFinite(n)) { return "plus —"; }
    return n < 0 ? "less " + pct(-n) : "plus " + pct(n);
  }

  function hours(n) { return trimNum(n, 1) + " h"; }
  function pieces(n) { return trimNum(n, 2); }

  function setText(id, text) {
    var el = byId(id);
    if (el) { el.textContent = text; }
  }

  /* Numeric cells go red when the figure is a loss. */
  function setNum(id, text, negative) {
    var el = byId(id);
    if (!el) { return; }
    el.textContent = text;
    el.className = negative ? "num neg" : "num";
  }

  function setMoneyCell(id, value, show) {
    if (!show) { setNum(id, "—", false); return; }
    setNum(id, money(value), value < 0);
  }

  /* ---------------- reading the form ---------------- */

  function raw(id) {
    var el = byId(id);
    return el ? el.value : "";
  }

  function readInput() {
    var o = {};
    for (var i = 0; i < FIELDS.length; i++) { o[FIELDS[i]] = raw(FIELDS[i]); }
    return o;
  }

  /* ---------------- the words ---------------- */

  function verdictText(r) {
    var rate = money(r.impliedHourly);
    var bench = money(r.benchmarkHourly);
    var pieceWord = r.saleableUnits === 1 ? "piece" : "pieces";
    var tail = "";

    if (r.targetBelowBenchmark) {
      tail = " Note too: the " + money(r.targetWage) + " an hour you set for yourself is " +
        "already below your own " + bench + " benchmark, so even the full-cost price " +
        "below under-pays you.";
    }

    if (!r.hasMakerHours) {
      return "Enter the hours you put into a batch — that is the whole point of this page. " +
        "Count the making hours and the unpaid ones: sourcing, packing, photographs, " +
        "answering buyers, keeping accounts." + tail;
    }

    if (!r.hasSaleableUnits) {
      return "Nothing saleable in this batch, so there is no price to spread the cost over. " +
        "You still paid out " + money(r.cashCostBatch) + " and worked " + hours(r.makerHours) +
        ". Raise the piece count or cut the seconds percentage." + tail;
    }

    if (r.verdict === "below_cash_cost") {
      return "Said plainly: at " + money(r.currentPrice) + " a piece this batch does not even " +
        "cover the " + money(r.cashCostBatch) + " you paid out for materials, helpers and " +
        "overhead. Before your own time is counted at all you are short " +
        money(-r.leftForMaker) + ", so your " + hours(r.makerHours) + " come out at " + rate +
        " an hour. You are paying to work. A floor of " + money(r.priceAtBenchmark) +
        " a piece would pay your benchmark wage." + tail;
    }

    if (r.verdict === "no_benchmark") {
      return "Your own time on this batch earns " + rate + " an hour at " +
        money(r.currentPrice) + " a piece. Enter a daily wage and the hours in your working " +
        "day to see how that compares with the minimum or living wage where you are." + tail;
    }

    if (r.verdict === "below_benchmark") {
      return "Said plainly: at " + money(r.currentPrice) + " a piece you are paying yourself " +
        rate + " an hour, which is below the " + bench + " an hour you entered as your " +
        "benchmark. Over " + hours(r.makerHours) + " that is " + money(r.shortfallPerBatch) +
        " of your own labour you are not being paid for. Charging " +
        money(r.upliftNeededPerUnit) + " more per piece — " + money(r.priceAtBenchmark) +
        " in all — would close the gap." + tail;
    }

    return "At " + money(r.currentPrice) + " a piece your own time earns " + rate +
      " an hour, at or above the " + bench + " an hour you entered as your benchmark. " +
      "Your " + pieces(r.saleableUnits) + " saleable " + pieceWord + " carry the " +
      money(r.cashCostBatch) + " you paid out and " + hours(r.makerHours) + " of your work." + tail;
  }

  function pillText(r) {
    if (!r.hasMakerHours) { return "Hours needed"; }
    if (!r.hasSaleableUnits) { return "No saleable pieces"; }
    if (r.verdict === "below_cash_cost") { return "Below cash cost"; }
    if (r.verdict === "no_benchmark") { return "No benchmark set"; }
    if (r.verdict === "below_benchmark") { return "Below your benchmark"; }
    return "At or above benchmark";
  }

  function subText(r) {
    if (!r.hasMakerHours) { return "No hours entered, so there is no hourly rate to show."; }
    if (!r.hasBenchmark) { return "No benchmark entered yet."; }
    var of = r.pctOfBenchmark === null ? "" :
      pct(r.pctOfBenchmark) + " of your " + money(r.benchmarkHourly) + " an hour benchmark";
    if (r.shortfallPerHour > 0) {
      return of + " — short by " + money(r.shortfallPerHour) + " an hour, " +
        money(r.shortfallPerBatch) + " on this batch.";
    }
    return of + " — your time is covered at this price.";
  }

  /* ---------------- render ---------------- */

  function compute() {
    var r = P.price(readInput());

    /* headline */
    setText("out-rate", r.hasMakerHours ? bigMoney(r.impliedHourly) : "—");
    setText("out-sub", subText(r));
    setText("out-pill", pillText(r));
    setText("out-days", r.daysOfWork === null
      ? hours(r.makerHours) + " of your work"
      : hours(r.makerHours) + " · " + trimNum(r.daysOfWork, 1) + " days of work");
    setText("out-verdict", verdictText(r));

    /* the batch */
    setMoneyCell("r-materials", r.materialsCost, true);
    setText("r-wastage-label", "+ Wastage at " + pct(P.nonNeg(raw("wastagePct"))));
    setMoneyCell("r-wastage", r.wastageAmount, true);
    setMoneyCell("r-hired", r.hiredLabour, true);
    setText("r-overhead-label", r.hasOverheadAllocation
      ? "Overhead share — " + money(P.nonNeg(raw("overheadMonth"))) + " over " +
        trimNum(P.nonNeg(raw("batchesPerMonth")), 2) + " batches a month"
      : "Overhead share — nothing allocated");
    setMoneyCell("r-overhead", r.overheadPerBatch, true);
    setMoneyCell("r-cash", r.cashCostBatch, true);
    setText("r-revenue-label", "Revenue — " + money(r.currentPrice) + " × " +
      pieces(r.saleableUnits) + " saleable of " + pieces(r.batchQty));
    setMoneyCell("r-revenue", r.revenueBatch, true);
    setText("r-hours-label", "Your own hours — " + hours(P.nonNeg(raw("hoursMaking"))) +
      " making + " + hours(P.nonNeg(raw("hoursUnpaid"))) + " unpaid");
    setNum("r-hours", hours(r.makerHours), false);
    setMoneyCell("r-left", r.leftForMaker, true);

    /* per piece */
    setMoneyCell("u-price", r.currentPrice, true);
    setMoneyCell("u-cash", r.cashCostPerUnit, r.hasSaleableUnits);
    setText("u-full-label", "Full cost with your time at " + money(r.targetWage) + " an hour");
    setMoneyCell("u-full", r.fullCostPerUnit, r.hasSaleableUnits);
    setMoneyCell("u-gap", r.gapPerUnit, r.hasSaleableUnits);

    /* price bands */
    setMoneyCell("b-bench", r.priceAtBenchmark, r.hasSaleableUnits && r.hasBenchmark);
    setText("b-whole-label", "Wholesale — full cost " + signedPct(r.marginPct) + " margin");
    setMoneyCell("b-whole", r.priceWholesale, r.hasSaleableUnits);
    setText("b-export-label", "Export — wholesale " + signedPct(r.exportUpliftPct));
    setMoneyCell("b-export", r.priceExport, r.hasSaleableUnits);
    setText("b-retail-label", "Retail or direct — wholesale " + signedPct(r.retailMarkupPct));
    setMoneyCell("b-retail", r.priceRetail, r.hasSaleableUnits);

    /* the benchmark hint beside the wage field */
    setText("bm-hint", r.hasBenchmark
      ? "your benchmark works out at " + money(r.benchmarkHourly) + " an hour"
      : "set a daily wage above to get an hourly benchmark");
  }

  /* ---------------- seeding from the named constants ---------------- */

  function seed(id, value) {
    var el = byId(id);
    if (!el) { return; }
    el.value = trimNum(value, 4);
  }

  function seedWageFields(onlyCurrencyDependent) {
    var ref = P.INDICATIVE_WAGE_REFERENCE[cur];
    if (!ref) { return; }
    var list = onlyCurrencyDependent ? CURRENCY_SEEDED : SEEDED;
    for (var i = 0; i < list.length; i++) {
      var id = list[i];
      if (dirty[id]) { continue; }
      if (id === "benchmarkDaily") { seed(id, ref.daily); }
      else if (id === "benchmarkHoursPerDay") { seed(id, ref.hoursPerDay); }
      else if (id === "targetWage") {
        seed(id, ref.hoursPerDay > 0 ? ref.daily / ref.hoursPerDay : 0);
      } else if (id === "marginPct") { seed(id, P.DEFAULT_MARGIN_PCT); }
      else if (id === "retailMarkupPct") { seed(id, P.DEFAULT_RETAIL_MARKUP_PCT); }
      else if (id === "exportUpliftPct") { seed(id, P.DEFAULT_EXPORT_UPLIFT_PCT); }
    }
  }

  /* The assumptions list quotes the same constants rather than repeating them
   * as literals in the markup. */
  function fillReference() {
    var inr = P.INDICATIVE_WAGE_REFERENCE.INR;
    var php = P.INDICATIVE_WAGE_REFERENCE.PHP;
    setText("ref-inr", "India — " + money0(inr.daily, "INR") + " a day over " +
      trimNum(inr.hoursPerDay, 2) + " hours, replaced by " + inr.authority);
    setText("ref-php", "Philippines — " + money0(php.daily, "PHP") + " a day over " +
      trimNum(php.hoursPerDay, 2) + " hours, replaced by " + php.authority);
    setText("ref-margin", trimNum(P.DEFAULT_MARGIN_PCT, 2) + "%");
    setText("ref-retail", trimNum(P.DEFAULT_RETAIL_MARKUP_PCT, 2) + "%");
    setText("ref-export", trimNum(P.DEFAULT_EXPORT_UPLIFT_PCT, 2) + "%");
  }

  /* ---------------- wiring ---------------- */

  function setCurrency(c) {
    cur = c;
    var btns = document.querySelectorAll("[data-cur]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed",
        btns[i].getAttribute("data-cur") === c ? "true" : "false");
    }
    var pres = document.querySelectorAll(".inp .pre");
    for (var j = 0; j < pres.length; j++) { pres[j].textContent = SYM[c]; }
    seedWageFields(true);
    compute();
  }

  function wire() {
    var numbers = document.querySelectorAll('input[type="number"]');
    var i;

    for (i = 0; i < numbers.length; i++) {
      numbers[i].addEventListener("input", compute);
    }
    for (i = 0; i < SEEDED.length; i++) {
      (function (id) {
        var el = byId(id);
        if (el) { el.addEventListener("input", function () { dirty[id] = true; }); }
      })(SEEDED[i]);
    }

    var curBtns = document.querySelectorAll("[data-cur]");
    for (i = 0; i < curBtns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          setCurrency(btn.getAttribute("data-cur"));
        });
      })(curBtns[i]);
    }

    var printBtn = byId("print");
    if (printBtn) {
      printBtn.addEventListener("click", function () { window.print(); });
    }

    var resetBtn = byId("reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        for (var k = 0; k < numbers.length; k++) { numbers[k].value = ""; }
        dirty = {};
        seedWageFields(false);
        compute();
      });
    }

    fillReference();
    seedWageFields(false);
    setCurrency("INR");
  }

  if (!P) { return; }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
