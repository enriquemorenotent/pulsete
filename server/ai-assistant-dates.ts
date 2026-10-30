export type AssistantDateRange = { start: number | null; end: number | null; label: string };
type CalendarDay = { start: number; end: number; label: string };

export const readAssistantDateRange = (prompt: string, now = new Date()): AssistantDateRange | null => {
  const days: Array<CalendarDay | null> = [];
  for (const relative of prompt.matchAll(/\b(yesterday|gestern|today|heute|vorgestern)\b/gi)) {
    const word = relative[1].toLowerCase();
    const offset = word === 'vorgestern' ? -2 : /yesterday|gestern/.test(word) ? -1 : 0;
    days.push(dayRange(now.getFullYear(), now.getMonth(), now.getDate() + offset, relative[0]));
  }
  for (const iso of prompt.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    days.push(checkedDay(+iso[1], +iso[2] - 1, +iso[3], iso[0]));
  }
  for (const numeric of prompt.matchAll(/\b(\d{1,2})([./])(\d{1,2})(?:[./](\d{4}))?\b/g)) {
    days.push(checkedDay(numeric[4] ? +numeric[4] : now.getFullYear(),
      +(numeric[2] === '.' ? numeric[3] : numeric[1]) - 1,
      +(numeric[2] === '.' ? numeric[1] : numeric[3]), numeric[0]));
  }
  const months = ['jan(?:uary|uar)?', 'feb(?:ruary|ruar)?', 'mar(?:ch)?|märz|maerz',
    'apr(?:il)?', 'may|mai', 'jun(?:e|i)?', 'jul(?:y|i)?', 'aug(?:ust)?',
    'sep(?:t(?:ember)?)?', 'oct(?:ober)?|okt(?:ober)?', 'nov(?:ember)?', 'dec(?:ember)?|dez(?:ember)?'];
  for (let month = 0; month < months.length; month++) {
    const pattern = months[month];
    const english = new RegExp(`\\b(${pattern})\\s+(\\d{1,2})(?:\\s*(?:through|to|until|[-–])\\s*(\\d{1,2}))?(?:,?\\s+(\\d{4}))?\\b`, 'gi');
    const german = new RegExp(`\\b(\\d{1,2})\\.?(?:\\s*(?:bis|[-–])\\s*(\\d{1,2})\\.?)?\\s+(${pattern})(?:\\s+(\\d{4}))?\\b`, 'gi');
    for (const hit of prompt.matchAll(english)) {
      const year = hit[4] ? +hit[4] : now.getFullYear();
      days.push(checkedDay(year, month, +hit[2], hit[0]));
      if (hit[3]) days.push(checkedDay(year, month, +hit[3], hit[0]));
    }
    for (const hit of prompt.matchAll(german)) {
      const year = hit[4] ? +hit[4] : now.getFullYear();
      days.push(checkedDay(year, month, +hit[1], hit[0]));
      if (hit[2]) days.push(checkedDay(year, month, +hit[2], hit[0]));
    }
  }
  // A multi-day question must retain every referenced day, including the last.
  // Invalid dates leave retrieval unrestricted rather than silently dropping days.
  if (days.length === 0 || days.some((day) => day === null)) return null;
  const valid = days as CalendarDay[];
  // Directional questions need an open interval, not the named day itself.
  // Multiple dates/directions are ambiguous here: keep evidence available.
  const directions = [...prompt.matchAll(/\b(before|after|vor|nach)\b/gi)];
  if (directions.length > 0) {
    if (valid.length !== 1 || directions.length !== 1) return null;
    const day = valid[0];
    const prefix = prompt.slice(0, prompt.indexOf(day.label));
    const direction = prefix.match(/\b(before|after|vor|nach)\s*$/i)?.[1];
    if (!direction) return null;
    const before = /^(before|vor)$/i.test(direction);
    return {
      start: before ? null : day.end,
      end: before ? day.start : null,
      label: `${direction} ${day.label}`,
    };
  }
  return {
    start: Math.min(...valid.map((day) => day.start)),
    end: Math.max(...valid.map((day) => day.end)),
    label: [...new Set(valid.map((day) => day.label))].join(' – '),
  };
};

const checkedDay = (year: number, month: number, day: number, label: string) => {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? dayRange(year, month, day, label) : null;
};
const dayRange = (year: number, month: number, day: number, label: string): CalendarDay => ({
  start: new Date(year, month, day).getTime(),
  end: new Date(year, month, day + 1).getTime(),
  label,
});
