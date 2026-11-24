# Living-wage craft pricing calculator for artisans

A free, open-source single-page calculator that prices a batch of handmade work
with the maker's own hours counted as a real cost — and then tells the maker, in
plain words, what hourly wage their current price is actually paying them.

Most craft costing counts materials and stops. The hours go in free, the unpaid
hours (sourcing, packing, photographs, answering buyers, keeping accounts) are
never counted at all, and the price ends up near cost. This page is built around
the one number that exposes that:

> revenue at your price − the cash you paid out, divided by your own hours

That figure is the headline. Beside it sits a wage benchmark **you** type in —
a daily minimum or living wage and the hours in your working day — and if your
implied rate falls below it, the page says so and shows how much more each piece
has to carry.

## What it computes

- **Your real hourly rate** at the price you charge today, and how it compares
  with your own benchmark (percentage of benchmark, shortfall per hour, shortfall
  per batch).
- **The batch build-up** — materials grossed up by wastage, money paid to
  helpers and job-workers, a share of monthly overhead, and what is left over to
  pay the maker.
- **Per saleable piece** — cash cost, full cost with the maker's time paid, and
  the gap against today's price.
- **Four price bands** — the floor that pays the benchmark wage with no margin,
  wholesale (full cost plus margin), export (wholesale plus an uplift), and
  retail or direct (wholesale plus a markup).

Seconds and breakage reduce the *saleable* piece count rather than the materials,
because the whole batch's cost has to be carried by the pieces that can actually
be sold. Wastage grosses up materials only. Monthly overhead is divided across
the batches made in a month.

## Who it's for

Individual artisans, self-help-group leaders pricing a group's output, and
direct-to-consumer craft founders — in India and the Philippines, in rupees or
pesos.

## The wage reference

The benchmark is **whatever you enter**. There is no authoritative rate baked in,
because there cannot be one: statutory minimum wages are fixed per state or
region and per skill category, and are revised regularly.

- **India** — the minimum-wage notification of your State Government labour
  department for the relevant scheduled employment and skill category (or the
  central rate where it applies).
- **Philippines** — the Wage Order of your Regional Tripartite Wages and
  Productivity Board under the Department of Labor and Employment (DOLE).

Both countries publish these as **daily** figures, which is why the page asks for
a daily wage plus the hours in a working day and derives the hourly benchmark
from them. The fields open with a round indicative placeholder so nothing is
blank; it is labelled as indicative in the page, lives in exactly one place in
the code (`INDICATIVE_WAGE_REFERENCE` in `assets/pricing.js`), and should be
replaced with your own current figure before you trust a single number here.

## How to run

It is a static page with no dependencies and no network calls. Serve the folder:

```sh
python3 -m http.server 8137
```

Then open <http://localhost:8137/>. Opening `index.html` straight off disk also
works. Everything is computed in the browser; nothing you type leaves your
device.

## Checking the arithmetic

All the costing rules live in `assets/pricing.js`, a pure module with no DOM and
no network access, so they can be exercised on their own:

```sh
node tests/pricing.test.js
```

That runs a table of scenarios and edge cases — zero hours, zero quantity, a
batch of one, large batches, fractional quantities, wastage limits, 100% seconds,
overhead with no batches to spread it over, a missing benchmark, the exact
benchmark boundary, negative margins and the clamp that stops a price going
negative, plus negative, blank and unparseable inputs — and asserts a set of
invariants over every one of them, including that no result field is ever `NaN`
or `Infinity`.

## Honesty about scope

This is an estimating tool, not a wage determination and not legal or tax advice.

- The benchmark is only as good as the figure you type in. Take it from your own
  current notification or wage order.
- Taxes and charges are **out of scope**: GST, VAT, income tax, marketplace
  commission, payment-gateway charges and shipping to the buyer are not included
  in any band. Add them on top of the band you choose.
- Seconds are treated as unsellable rather than as discounted B-grade stock.
- A price band is a starting point for a conversation, not a market price. What a
  buyer will pay depends on your craft, your market and your reputation; what the
  page can tell you is what a price costs *you*.

MIT licensed.
