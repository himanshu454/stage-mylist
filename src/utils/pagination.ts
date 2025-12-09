export function toNumberOrDefault(v: any, d: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
}
