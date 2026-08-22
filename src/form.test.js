import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { readCompensationInputs } from "./form.js";

const scalarValues = {
  "#currency": "USD",
  "#base": "200000",
  "#growth": "3",
  "#bonusRate": "15",
  "#target": "500000",
  "#stockGrant": "800000"
};

const yearlyValues = {
  "input.vesting": ["25", "25", "25", "25", "0"],
  "input.signon": ["100000", "0", "0", "0", "0"],
  "input.refresh": ["0", "10000", "20000", "30000", "40000"],
  "input.other-cash": ["5000", "0", "0", "0", "0"]
};

function rootFixture() {
  return {
    querySelector: vi.fn((selector) => (
      Object.hasOwn(scalarValues, selector) ? { value: scalarValues[selector] } : null
    )),
    querySelectorAll: vi.fn((selector) => (
      (yearlyValues[selector] ?? []).map((value) => ({ value }))
    ))
  };
}

describe("readCompensationInputs", () => {
  it("reads only input elements for every five-year field", () => {
    const root = rootFixture();

    expect(readCompensationInputs(root)).toEqual({
      currency: "USD",
      base: 200_000,
      growth: 0.03,
      bonusRate: 0.15,
      target: 500_000,
      stockGrant: 800_000,
      vesting: [25, 25, 25, 25, 0],
      signon: [100_000, 0, 0, 0, 0],
      refresh: [0, 10_000, 20_000, 30_000, 40_000],
      otherCash: [5_000, 0, 0, 0, 0]
    });
    expect(root.querySelectorAll.mock.calls.map(([selector]) => selector)).toEqual([
      "input.vesting",
      "input.signon",
      "input.refresh",
      "input.other-cash"
    ]);
  });

  it("normalizes empty and negative numeric input and defaults currency", () => {
    const root = rootFixture();
    root.querySelector.mockImplementation((selector) => {
      if (selector === "#currency") return { value: "" };
      if (selector === "#base") return { value: "-100" };
      if (Object.hasOwn(scalarValues, selector)) return { value: "" };
      return null;
    });

    expect(readCompensationInputs(root)).toMatchObject({
      currency: "USD",
      base: 0,
      growth: 0,
      bonusRate: 0,
      target: 0,
      stockGrant: 0
    });
  });

  it("fails clearly when required controls are missing", () => {
    const root = rootFixture();
    root.querySelector.mockReturnValue(null);
    expect(() => readCompensationInputs(root)).toThrow("Missing calculator input: #currency");
  });

  it("keeps exactly five input controls per yearly field in the shipped page", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const inputTags = [...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) => tag);

    Object.keys(yearlyValues).forEach((selector) => {
      const className = selector.replace("input.", "");
      const matchingInputs = inputTags.filter((tag) => (
        new RegExp(`class="[^"]*\\b${className}\\b[^"]*"`).test(tag)
      ));
      expect(matchingInputs, selector).toHaveLength(5);
    });
  });
});
