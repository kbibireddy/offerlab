export const YEAR_COUNT = 5;
export const DEFAULT_SCENARIO_LIMIT = 100_000;

const METRICS = new Set(["year1", "fourYear", "fiveYear"]);

function requireFiniteNonNegative(name, value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number.`);
  }
}

function requireYearValues(name, values) {
  if (!Array.isArray(values) || values.length !== YEAR_COUNT) {
    throw new RangeError(`${name} must contain exactly ${YEAR_COUNT} values.`);
  }
  values.forEach((value, index) => requireFiniteNonNegative(`${name}[${index}]`, value));
}

export function vestingTotal(vesting) {
  requireYearValues("vesting", vesting);
  return vesting.reduce((sum, value) => sum + value, 0);
}

export function calculateCompensationYears(input, overrides = {}) {
  requireFiniteNonNegative("base", input.base);
  requireFiniteNonNegative("growth", input.growth);
  requireFiniteNonNegative("bonusRate", input.bonusRate);
  requireFiniteNonNegative("stockGrant", input.stockGrant);
  requireYearValues("vesting", input.vesting);
  requireYearValues("signon", input.signon);
  requireYearValues("refresh", input.refresh);
  requireYearValues("otherCash", input.otherCash);

  const startingBase = overrides.base ?? input.base;
  const equityGrant = overrides.equity ?? input.stockGrant;
  const firstYearSigningBonus = overrides.signon;
  requireFiniteNonNegative("startingBase", startingBase);
  requireFiniteNonNegative("equityGrant", equityGrant);
  if (firstYearSigningBonus !== undefined) {
    requireFiniteNonNegative("firstYearSigningBonus", firstYearSigningBonus);
  }

  return Array.from({ length: YEAR_COUNT }, (_, index) => {
    const base = startingBase * Math.pow(1 + input.growth, index);
    const bonus = base * input.bonusRate;
    const stock = equityGrant * (input.vesting[index] / 100);
    const signon = index === 0 && firstYearSigningBonus !== undefined
      ? firstYearSigningBonus
      : input.signon[index];
    const refresh = input.refresh[index];
    const otherCash = input.otherCash[index];
    return {
      base,
      bonus,
      stock,
      signon,
      refresh,
      otherCash,
      total: base + bonus + stock + signon + refresh + otherCash
    };
  });
}

export function summarizeCompensation(years, annualTarget = 0) {
  if (!Array.isArray(years) || years.length !== YEAR_COUNT) {
    throw new RangeError(`years must contain exactly ${YEAR_COUNT} values.`);
  }
  requireFiniteNonNegative("annualTarget", annualTarget);
  years.forEach((year, index) => requireFiniteNonNegative(`years[${index}].total`, year?.total));

  const fiveYearTotal = years.reduce((sum, year) => sum + year.total, 0);
  const fourYearTotal = years.slice(0, 4).reduce((sum, year) => sum + year.total, 0);
  return {
    fiveYearTotal,
    fourYearTotal,
    fiveYearAverage: fiveYearTotal / YEAR_COUNT,
    fourYearAverage: fourYearTotal / 4,
    fiveYearTarget: annualTarget * YEAR_COUNT,
    fiveYearTargetGap: annualTarget * YEAR_COUNT - fiveYearTotal
  };
}

export function compareToTarget(value, target, tolerance = 0) {
  requireFiniteNonNegative("value", value);
  requireFiniteNonNegative("target", target);
  requireFiniteNonNegative("tolerance", tolerance);
  if (tolerance > 1) throw new RangeError("tolerance must not exceed 1.");

  const margin = target * tolerance;
  const lower = target - margin;
  const upper = target + margin;
  return {
    lower,
    upper,
    status: value < lower ? "below" : value > upper ? "above" : "within",
    difference: value - target
  };
}

export function buildSteppedValues(min, max, step) {
  requireFiniteNonNegative("min", min);
  requireFiniteNonNegative("max", max);
  requireFiniteNonNegative("step", step);
  if (max < min) throw new RangeError("max must be greater than or equal to min.");
  if (step === 0) throw new RangeError("step must be greater than zero.");

  const count = Math.floor((max - min) / step) + 1;
  const values = Array.from({ length: count }, (_, index) => min + index * step);
  if (values.at(-1) < max) values.push(max);
  return values;
}

export function scenarioMetricValue(input, base, equity, signon, metric) {
  if (!METRICS.has(metric)) throw new RangeError(`Unsupported metric: ${metric}.`);
  const totals = calculateCompensationYears(input, { base, equity, signon }).map((year) => year.total);
  if (metric === "fourYear") return totals.slice(0, 4).reduce((sum, value) => sum + value, 0) / 4;
  if (metric === "fiveYear") return totals.reduce((sum, value) => sum + value, 0) / YEAR_COUNT;
  return totals[0];
}

export function validateScenarioConfig(config, limit = DEFAULT_SCENARIO_LIMIT) {
  requireFiniteNonNegative("limit", limit);
  const errors = [];
  const dimensions = [
    ["base", config.baseMin, config.baseMax, config.baseStep],
    ["equity", config.equityMin, config.equityMax, config.equityStep],
    ["signing bonus", config.signonMin, config.signonMax, config.signonStep]
  ];

  let combinationCount = 1;
  dimensions.forEach(([name, min, max, step]) => {
    try {
      combinationCount *= buildSteppedValues(min, max, step).length;
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
  });
  if (!METRICS.has(config.metric)) errors.push(`Unsupported metric: ${config.metric}.`);
  if (!Number.isFinite(config.tolerance) || config.tolerance < 0 || config.tolerance > 1) {
    errors.push("Tolerance must be between 0 and 1.");
  }
  if (combinationCount > limit) {
    errors.push(`This range creates ${combinationCount.toLocaleString()} combinations; the limit is ${limit.toLocaleString()}.`);
  }
  return { valid: errors.length === 0, errors, combinationCount };
}

export function generateScenarios(input, config, limit = DEFAULT_SCENARIO_LIMIT) {
  const validation = validateScenarioConfig(config, limit);
  if (!validation.valid) throw new RangeError(validation.errors.join(" "));
  if (vestingTotal(input.vesting) > 100) {
    throw new RangeError("The vesting schedule cannot exceed 100%.");
  }

  const bases = buildSteppedValues(config.baseMin, config.baseMax, config.baseStep);
  const equities = buildSteppedValues(config.equityMin, config.equityMax, config.equityStep);
  const signons = buildSteppedValues(config.signonMin, config.signonMax, config.signonStep);
  const scenarios = [];

  for (const base of bases) {
    for (const equity of equities) {
      for (const signon of signons) {
        const total = scenarioMetricValue(input, base, equity, signon, config.metric);
        const comparison = compareToTarget(total, input.target, config.tolerance);
        scenarios.push({
          base,
          equity,
          signon,
          total,
          status: comparison.status,
          difference: comparison.difference
        });
      }
    }
  }
  return scenarios;
}

export function scenarioExtent(scenarios, key) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new RangeError("scenarios must not be empty.");
  }
  let min = Infinity;
  let max = -Infinity;
  scenarios.forEach((scenario) => {
    const value = scenario[key];
    requireFiniteNonNegative(`scenario.${key}`, value);
    min = Math.min(min, value);
    max = Math.max(max, value);
  });
  return { min, max };
}

export function buildHistogramBins(scenarios, requestedBinCount = 24) {
  if (!Number.isInteger(requestedBinCount) || requestedBinCount < 1) {
    throw new RangeError("requestedBinCount must be a positive integer.");
  }
  const { min, max } = scenarioExtent(scenarios, "total");
  const binCount = max === min ? 1 : requestedBinCount;
  const binWidth = max === min ? 1 : (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    index,
    min: min + index * binWidth,
    max: index === binCount - 1 ? max : min + (index + 1) * binWidth,
    below: 0,
    within: 0,
    above: 0,
    total: 0
  }));

  scenarios.forEach((scenario) => {
    const index = Math.min(binCount - 1, Math.floor((scenario.total - min) / binWidth));
    if (!["below", "within", "above"].includes(scenario.status)) {
      throw new RangeError(`Unsupported scenario status: ${scenario.status}.`);
    }
    bins[index][scenario.status]++;
    bins[index].total++;
  });
  return { min, max, binWidth, bins };
}
