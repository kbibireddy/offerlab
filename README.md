# Compensation Planner

An interactive calculator for modeling and comparing multi-year compensation scenarios.

## Features

- Slider controls for every compensation input
- Configurable currency
- Base salary growth and target bonus calculations
- Custom stock vesting schedules
- Signing bonus, refresh equity, and other cash by year
- Four- and five-year compensation summaries
- Target-gap and compensation-cliff analysis
- Scenario search across configurable base, equity, and signing bonus ranges
- Target-band scatter plot, distribution chart, and closest package matches
- Sortable package results with drill-down from distribution bars

Compensation Planner runs entirely in the browser. No compensation data is uploaded or stored.

## Development

Requires Node.js 22 or later.

```bash
npm ci
npm run dev
```

## Verification

The calculation engine has deterministic examples, boundary tests, validation tests, scenario-grid tests, histogram tests, and property-based invariants.

```bash
npm run check
```

Every pull request and push to `main` runs the complete coverage suite and production build in GitHub Actions. Deployment proceeds only after both succeed.
