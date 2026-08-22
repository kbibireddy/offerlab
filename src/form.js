const FIVE_YEAR_FIELDS = {
  vesting: "input.vesting",
  signon: "input.signon",
  refresh: "input.refresh",
  otherCash: "input.other-cash"
};

function numericValue(element) {
  return Math.max(0, Number(element?.value) || 0);
}

function requiredElement(root, selector) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Missing calculator input: ${selector}`);
  return element;
}

export function readCompensationInputs(root = document) {
  const values = {
    currency: requiredElement(root, "#currency").value || "USD",
    base: numericValue(requiredElement(root, "#base")),
    growth: numericValue(requiredElement(root, "#growth")) / 100,
    bonusRate: numericValue(requiredElement(root, "#bonusRate")) / 100,
    target: numericValue(requiredElement(root, "#target")),
    stockGrant: numericValue(requiredElement(root, "#stockGrant"))
  };

  Object.entries(FIVE_YEAR_FIELDS).forEach(([field, selector]) => {
    values[field] = [...root.querySelectorAll(selector)].map(numericValue);
  });
  return values;
}
