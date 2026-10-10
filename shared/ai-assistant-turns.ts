import { aiAssistantThreadMaxTurns, type AiAssistantTurn } from './protocol-ai.js';

// Keep the request below the HTTP body limit even for four-byte Unicode text.
export const normalizeAssistantTurns = (turns: readonly AiAssistantTurn[]) => {
  let remaining = 6_000;
  const result: AiAssistantTurn[] = [];
  for (const turn of turns.slice(-aiAssistantThreadMaxTurns).reverse()) {
    const text = turn.text.trim();
    if (!text || remaining <= 0) continue;
    const limit = Math.min(1_000, remaining);
    let prefix = text.slice(0, Math.max(0, limit - 20));
    if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
    const clipped = text.length > limit ? `${prefix}… [text shortened]` : text;
    result.push({ role: turn.role, text: clipped });
    remaining -= clipped.length;
  }
  return result.reverse();
};
