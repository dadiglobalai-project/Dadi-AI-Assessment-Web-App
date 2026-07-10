export const isNonEmptyString = (value: unknown) => {
  return typeof value === "string" && value.trim().length > 0;
};

export const isPositiveNumber = (value: unknown) => {
  return Number.isFinite(Number(value)) && Number(value) > 0;
};
