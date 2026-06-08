export function toCents(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.round(number * 100);
}

export function fromCents(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}
