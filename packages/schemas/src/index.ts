export * from "./problem";

export const SUBJECTS = ["数学", "理科", "社会"] as const;
export type Subject = typeof SUBJECTS[number];

export const UNITS: Record<Subject, string[]> = {
  数学: ["一次関数"],
  理科: ["化学式"],
  社会: ["太平洋戦争"],
};

