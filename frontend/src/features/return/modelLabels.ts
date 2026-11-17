const LABELS: Record<string, string> = {
  계산기: "calculator", 가위: "scissors", 마우스: "mouse", "컴퓨터 마우스": "mouse",
  calculator: "calculator", scissors: "scissors", mouse: "mouse",
};
export function modelLabel(name: string): string | undefined {
  const key = name.trim().toLowerCase();
  return Object.hasOwn(LABELS, key) ? LABELS[key] : undefined;
}
