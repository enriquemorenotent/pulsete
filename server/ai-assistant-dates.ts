export type AssistantDateRange = { start: number; end: number; label: string };

export const readAssistantDateRange = (prompt: string, now = new Date()): AssistantDateRange | null => {
  const relative = /\b(yesterday|gestern|today|heute|vorgestern)\b/i.exec(prompt);
  if (relative) {
    const offset = /yesterday|gestern/i.test(relative[1]) ? -1 : 0;
    return dayRange(now.getFullYear(), now.getMonth(), now.getDate() +
      (relative[1].toLowerCase() === 'vorgestern' ? -2 : offset), relative[1]);
  }
  const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(prompt);
  if (iso) return checkedDay(+iso[1], +iso[2] - 1, +iso[3], iso[0]);
  const numeric = /\b(\d{1,2})([./])(\d{1,2})(?:[./](\d{4}))?\b/.exec(prompt);
  if (numeric) return checkedDay(numeric[4] ? +numeric[4] : now.getFullYear(),
    +(numeric[2] === '.' ? numeric[3] : numeric[1]) - 1,
    +(numeric[2] === '.' ? numeric[1] : numeric[3]), numeric[0]);
  const months = ['jan(?:uary|uar)?', 'feb(?:ruary|ruar)?', 'mar(?:ch)?|märz|maerz',
    'apr(?:il)?', 'may|mai', 'jun(?:e|i)?', 'jul(?:y|i)?', 'aug(?:ust)?',
    'sep(?:t(?:ember)?)?', 'oct(?:ober)?|okt(?:ober)?', 'nov(?:ember)?', 'dec(?:ember)?|dez(?:ember)?'];
  for (let month = 0; month < months.length; month++) {
    const pattern = months[month];
    const english = new RegExp(`\\b(${pattern})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?\\b`, 'i').exec(prompt);
    const german = new RegExp(`\\b(\\d{1,2})\\.?\\s+(${pattern})(?:\\s+(\\d{4}))?\\b`, 'i').exec(prompt);
    if (english || german) {
      const hit = (english ?? german)!;
      return checkedDay(hit[3] ? +hit[3] : now.getFullYear(), month, +(english ? hit[2] : hit[1]), hit[0]);
    }
  }
  return null;
};

const checkedDay = (year: number, month: number, day: number, label: string) => {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? dayRange(year, month, day, label) : null;
};
const dayRange = (year: number, month: number, day: number, label: string): AssistantDateRange => ({
  start: new Date(year, month, day).getTime(),
  end: new Date(year, month, day + 1).getTime(),
  label,
});
