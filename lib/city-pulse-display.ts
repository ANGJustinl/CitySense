export function cityPulseAgeLabel(ageMinutes?: number) {
  if (ageMinutes === undefined) return "时间未知";
  if (ageMinutes <= 0) return "刚刚";
  return `${ageMinutes} 分钟前`;
}

export function cityPulseMetricWidth(value: number, max: number) {
  return Math.max(8, value / Math.max(1, max) * 100);
}
