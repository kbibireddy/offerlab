import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  buildHistogramBins,
  buildSteppedValues,
  calculateCompensationYears,
  compareToTarget,
  generateScenarios,
  scenarioExtent,
  scenarioMetricValue,
  summarizeCompensation,
  validateScenarioConfig,
  vestingTotal
} from "./calculator.js";

const input = (overrides = {}) => ({
  base: 200_000,
  growth: 0.03,
  bonusRate: 0.15,
  target: 500_000,
  stockGrant: 800_000,
  vesting: [25, 25, 25, 25, 0],
  signon: [100_000, 0, 0, 0, 0],
  refresh: [0, 10_000, 20_000, 30_000, 40_000],
  otherCash: [5_000, 0, 0, 0, 0],
  ...overrides
});

const config = (overrides = {}) => ({
  baseMin: 180_000,
  baseMax: 200_000,
  baseStep: 10_000,
  equityMin: 600_000,
  equityMax: 700_000,
  equityStep: 100_000,
  signonMin: 50_000,
  signonMax: 100_000,
  signonStep: 50_000,
  tolerance: 0.05,
  metric: "year1",
  ...overrides
});

describe("vestingTotal", () => {
  it("adds all five vesting shares", () => {
    expect(vestingTotal([10, 10, 40, 40, 0])).toBe(100);
  });

  it.each([
    [[25, 25], "exactly 5"],
    [[25, 25, 25, 25, -1], "non-negative"],
    [[25, 25, 25, 25, Number.NaN], "finite"]
  ])("rejects invalid schedules", (vesting, message) => {
    expect(() => vestingTotal(vesting)).toThrow(message);
  });
});

describe("calculateCompensationYears", () => {
  it("calculates every component with compound salary growth", () => {
    const years = calculateCompensationYears(input());

    expect(years).toHaveLength(5);
    expect(years[0]).toEqual({
      base: 200_000,
      bonus: 30_000,
      stock: 200_000,
      signon: 100_000,
      refresh: 0,
      otherCash: 5_000,
      total: 535_000
    });
    expect(years[1].base).toBeCloseTo(206_000);
    expect(years[1].bonus).toBeCloseTo(30_900);
    expect(years[1].total).toBeCloseTo(446_900);
    expect(years[4].stock).toBe(0);
    expect(years[4].refresh).toBe(40_000);
  });

  it("applies scenario overrides only where intended", () => {
    const source = input();
    const snapshot = structuredClone(source);
    const years = calculateCompensationYears(source, {
      base: 250_000,
      equity: 1_000_000,
      signon: 150_000
    });

    expect(years[0].base).toBe(250_000);
    expect(years[0].stock).toBe(250_000);
    expect(years[0].signon).toBe(150_000);
    expect(years[1].signon).toBe(source.signon[1]);
    expect(source).toEqual(snapshot);
  });

  it.each([
    [{ base: -1 }, "base"],
    [{ growth: Number.POSITIVE_INFINITY }, "growth"],
    [{ bonusRate: Number.NaN }, "bonusRate"],
    [{ stockGrant: -1 }, "stockGrant"],
    [{ signon: [0] }, "signon"],
    [{ refresh: [0, 0, 0, 0, -1] }, "refresh"],
    [{ otherCash: null }, "otherCash"]
  ])("rejects malformed input: %s", (override, message) => {
    expect(() => calculateCompensationYears(input(override))).toThrow(message);
  });

  it("rejects malformed override values", () => {
    expect(() => calculateCompensationYears(input(), { base: -1 })).toThrow("startingBase");
    expect(() => calculateCompensationYears(input(), { equity: -1 })).toThrow("equityGrant");
    expect(() => calculateCompensationYears(input(), { signon: -1 })).toThrow("firstYearSigningBonus");
  });
});

describe("summarizeCompensation", () => {
  it("returns four- and five-year totals, averages, and target gap", () => {
    const years = [
      { total: 100 },
      { total: 200 },
      { total: 300 },
      { total: 400 },
      { total: 500 }
    ];
    expect(summarizeCompensation(years, 350)).toEqual({
      fiveYearTotal: 1_500,
      fourYearTotal: 1_000,
      fiveYearAverage: 300,
      fourYearAverage: 250,
      fiveYearTarget: 1_750,
      fiveYearTargetGap: 250
    });
  });

  it("rejects invalid years and targets", () => {
    expect(() => summarizeCompensation([], 0)).toThrow("exactly 5");
    expect(() => summarizeCompensation(Array(5).fill({ total: -1 }), 0)).toThrow("years[0].total");
    expect(() => summarizeCompensation(Array(5).fill({ total: 1 }), -1)).toThrow("annualTarget");
  });
});

describe("compareToTarget", () => {
  it.each([
    [89, 100, 0.1, "below"],
    [90, 100, 0.1, "within"],
    [100, 100, 0.1, "within"],
    [110, 100, 0.1, "within"],
    [111, 100, 0.1, "above"]
  ])("classifies %s against %s ± %s", (value, target, tolerance, status) => {
    expect(compareToTarget(value, target, tolerance)).toMatchObject({
      lower: 90,
      upper: 110,
      status,
      difference: value - target
    });
  });

  it("rejects invalid tolerances and values", () => {
    expect(() => compareToTarget(-1, 100)).toThrow("value");
    expect(() => compareToTarget(1, -1)).toThrow("target");
    expect(() => compareToTarget(1, 1, -1)).toThrow("tolerance");
    expect(() => compareToTarget(1, 1, 1.01)).toThrow("must not exceed 1");
  });
});

describe("buildSteppedValues", () => {
  it("builds aligned ranges inclusively", () => {
    expect(buildSteppedValues(100, 200, 50)).toEqual([100, 150, 200]);
  });

  it("always includes a non-aligned maximum", () => {
    expect(buildSteppedValues(100, 220, 50)).toEqual([100, 150, 200, 220]);
  });

  it("supports a single-value range", () => {
    expect(buildSteppedValues(100, 100, 50)).toEqual([100]);
  });

  it("rejects invalid range definitions", () => {
    expect(() => buildSteppedValues(2, 1, 1)).toThrow("max");
    expect(() => buildSteppedValues(0, 1, 0)).toThrow("greater than zero");
    expect(() => buildSteppedValues(-1, 1, 1)).toThrow("min");
  });

  it("is monotonic, bounded, and includes both endpoints", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 1_000_000 }),
      fc.integer({ min: 0, max: 100_000 }),
      fc.integer({ min: 1, max: 100_000 }),
      (min, distance, step) => {
        const max = min + distance;
        const values = buildSteppedValues(min, max, step);
        expect(values[0]).toBe(min);
        expect(values.at(-1)).toBe(max);
        expect(values.every((value) => value >= min && value <= max)).toBe(true);
        expect(values.every((value, index) => index === 0 || value > values[index - 1])).toBe(true);
      }
    ));
  });
});

describe("scenario metrics and generation", () => {
  it("calculates each supported comparison metric", () => {
    const source = input({ growth: 0 });
    const years = calculateCompensationYears(source, { base: 200_000, equity: 800_000, signon: 100_000 });

    expect(scenarioMetricValue(source, 200_000, 800_000, 100_000, "year1")).toBe(years[0].total);
    expect(scenarioMetricValue(source, 200_000, 800_000, 100_000, "fourYear"))
      .toBe(years.slice(0, 4).reduce((sum, year) => sum + year.total, 0) / 4);
    expect(scenarioMetricValue(source, 200_000, 800_000, 100_000, "fiveYear"))
      .toBe(years.reduce((sum, year) => sum + year.total, 0) / 5);
    expect(() => scenarioMetricValue(source, 1, 1, 1, "median")).toThrow("Unsupported metric");
  });

  it("validates grids and computes the exact inclusive combination count", () => {
    expect(validateScenarioConfig(config())).toEqual({
      valid: true,
      errors: [],
      combinationCount: 12
    });

    const invalid = validateScenarioConfig(config({
      baseMin: 10,
      baseMax: 0,
      equityStep: 0,
      metric: "median",
      tolerance: 2
    }));
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toHaveLength(4);
  });

  it("enforces the configured scenario limit", () => {
    const result = validateScenarioConfig(config(), 10);
    expect(result.valid).toBe(false);
    expect(result.combinationCount).toBe(12);
    expect(result.errors[0]).toContain("limit is 10");
  });

  it("generates every combination with correct values and statuses", () => {
    const scenarios = generateScenarios(input(), config());
    expect(scenarios).toHaveLength(12);
    expect(scenarios[0]).toMatchObject({
      base: 180_000,
      equity: 600_000,
      signon: 50_000
    });
    scenarios.forEach((scenario) => {
      expect(scenario.total).toBe(scenarioMetricValue(
        input(),
        scenario.base,
        scenario.equity,
        scenario.signon,
        "year1"
      ));
      expect(["below", "within", "above"]).toContain(scenario.status);
      expect(scenario.difference).toBe(scenario.total - input().target);
    });
  });

  it("rejects invalid configurations and vesting totals", () => {
    expect(() => generateScenarios(input(), config({ baseStep: 0 }))).toThrow("greater than zero");
    expect(() => generateScenarios(input({ vesting: [30, 30, 30, 30, 0] }), config()))
      .toThrow("cannot exceed 100");
  });

  it("preserves monotonic Year 1 compensation as each primary lever increases", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 500_000 }),
      fc.integer({ min: 0, max: 2_000_000 }),
      fc.integer({ min: 0, max: 500_000 }),
      fc.integer({ min: 1, max: 100_000 }),
      (base, equity, signon, increase) => {
        const source = input();
        const initial = scenarioMetricValue(source, base, equity, signon, "year1");
        expect(scenarioMetricValue(source, base + increase, equity, signon, "year1")).toBeGreaterThan(initial);
        expect(scenarioMetricValue(source, base, equity + increase, signon, "year1")).toBeGreaterThan(initial);
        expect(scenarioMetricValue(source, base, equity, signon + increase, "year1")).toBeGreaterThan(initial);
      }
    ));
  });
});

describe("scenario aggregation", () => {
  const scenarios = [
    { total: 100, base: 50, status: "below" },
    { total: 150, base: 70, status: "within" },
    { total: 200, base: 60, status: "above" },
    { total: 200, base: 80, status: "above" }
  ];

  it("finds numeric extents", () => {
    expect(scenarioExtent(scenarios, "total")).toEqual({ min: 100, max: 200 });
    expect(scenarioExtent(scenarios, "base")).toEqual({ min: 50, max: 80 });
  });

  it("builds histogram bins without losing scenarios or statuses", () => {
    const histogram = buildHistogramBins(scenarios, 2);
    expect(histogram).toMatchObject({ min: 100, max: 200, binWidth: 50 });
    expect(histogram.bins).toHaveLength(2);
    expect(histogram.bins.reduce((sum, bin) => sum + bin.total, 0)).toBe(scenarios.length);
    expect(histogram.bins.reduce((sum, bin) => sum + bin.below, 0)).toBe(1);
    expect(histogram.bins.reduce((sum, bin) => sum + bin.within, 0)).toBe(1);
    expect(histogram.bins.reduce((sum, bin) => sum + bin.above, 0)).toBe(2);
  });

  it("uses one meaningful bin when all totals are equal", () => {
    const histogram = buildHistogramBins([
      { total: 100, status: "within" },
      { total: 100, status: "within" }
    ]);
    expect(histogram.bins).toHaveLength(1);
    expect(histogram.bins[0]).toMatchObject({ min: 100, max: 100, within: 2, total: 2 });
  });

  it("rejects malformed aggregation inputs", () => {
    expect(() => scenarioExtent([], "total")).toThrow("must not be empty");
    expect(() => scenarioExtent([{ total: -1 }], "total")).toThrow("scenario.total");
    expect(() => buildHistogramBins(scenarios, 0)).toThrow("positive integer");
    expect(() => buildHistogramBins([{ total: 1, status: "unknown" }])).toThrow("Unsupported scenario status");
  });
});

describe("calculation invariants", () => {
  it("always totals the displayed components exactly", () => {
    fc.assert(fc.property(
      fc.record({
        base: fc.integer({ min: 0, max: 1_000_000 }),
        growth: fc.double({ min: 0, max: 0.3, noNaN: true }),
        bonusRate: fc.double({ min: 0, max: 1, noNaN: true }),
        stockGrant: fc.integer({ min: 0, max: 5_000_000 }),
        signon: fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 5, maxLength: 5 }),
        refresh: fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 5, maxLength: 5 }),
        otherCash: fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 5, maxLength: 5 })
      }),
      (generated) => {
        const source = input({
          ...generated,
          vesting: [20, 20, 20, 20, 20]
        });
        calculateCompensationYears(source).forEach((year) => {
          expect(year.total).toBeCloseTo(
            year.base + year.bonus + year.stock + year.signon + year.refresh + year.otherCash,
            8
          );
          expect(year.total).toBeGreaterThanOrEqual(0);
        });
      }
    ), { numRuns: 200 });
  });

  it("preserves the equity grant when five-year vesting totals 100%", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 5_000_000 }),
      fc.array(fc.integer({ min: 0, max: 25 }), { minLength: 4, maxLength: 4 }),
      (grant, shares) => {
        const sum = shares.reduce((total, value) => total + value, 0);
        const vesting = [...shares, 100 - sum];
        const years = calculateCompensationYears(input({ stockGrant: grant, vesting }));
        expect(years.reduce((total, year) => total + year.stock, 0)).toBeCloseTo(grant, 8);
      }
    ));
  });
});
