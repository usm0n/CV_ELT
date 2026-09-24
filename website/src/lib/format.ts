export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
};

export const fmtPct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

export const labelName = (label: string) => label.replace(/_/g, " ");
