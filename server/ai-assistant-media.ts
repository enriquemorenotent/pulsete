import { z } from 'zod';
import type { AiAssistantContext, AiAssistantAttachment, AiAssistantWebSource } from '../shared/protocol-ai.js';

const marker = 'PULSETE_MEDIA ';
const proposalSchema = z.object({
  source: z.string().regex(/^[SW]\d+$/),
  kind: z.enum(['image', 'video', 'link']),
  title: z.string().trim().min(1).max(140),
  url: z.string().max(2048).optional(),
}).strict();
const proposalListSchema = z.array(z.unknown()).max(3);

export const assistantMediaInstructions =
  'When a particular image, video, or linked resource would help answer the user, add a single final line after the prose: '
  + marker + '[{"source":"W1","kind":"image","title":"Short descriptive caption"}]. '
  + 'Use image for a direct image or a page for the requested picture, video for a direct video or its watch page, and link for other resources. '
  + 'Use source W labels for the exact supplied web URL. For a link from IRC use the S label and include "url" copied exactly from that message. '
  + 'Include at most three distinct resources. Use plain text titles and only links supported by those sources. '
  + 'Pulsete displays these as cards with available previews, so keep the prose brief and avoid repeating the same link. Leave out the line when cards would not help. Never put it in a draft or a tool request.';

const readHttpUrl = (value: string | undefined) => {
  if (!value || value.length > 2048) return null;
  const url = URL.parse(value);
  return url && (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
    ? url.href : null;
};

function chatContainsLink(body: string, href: string) {
  return [...body.matchAll(/https?:\/\/[^\s<>"\x00-\x1f]+/gi)].some(([candidate]) =>
    readHttpUrl(candidate) === href || readHttpUrl(candidate.replace(/[.,!?;:)\]}]+$/, '')) === href);
}

export function readAssistantMedia(
  answer: string,
  sources: AiAssistantContext['sources'],
  web: ReadonlyMap<string, AiAssistantWebSource>,
): { text: string; attachments: AiAssistantAttachment[] } {
  const cleaned = answer.trimEnd();
  const tail = cleaned.lastIndexOf('\n') + 1;
  const mediaLine = cleaned.slice(tail).trimStart();
  if (!mediaLine.startsWith(marker)) return { text: answer, attachments: [] };
  const text = cleaned.slice(0, tail).trimEnd();
  let raw: unknown;
  try { raw = JSON.parse(mediaLine.slice(marker.length)); }
  catch { return { text, attachments: [] }; }
  const result = proposalListSchema.safeParse(raw);
  if (!result.success) return { text, attachments: [] };

  const seen = new Set<string>();
  const attachments: AiAssistantAttachment[] = [];
  for (const candidate of result.data) {
    const parsed = proposalSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const { source, kind, title, url } = parsed.data;
    const webSource = [...web.values()].find(value => value.label === source);
    const message = sources?.find(value => value.label === source)?.message;
    const href = readHttpUrl(url ?? webSource?.url);
    if (!href || seen.has(href)) continue;
    if (webSource ? readHttpUrl(webSource.url) !== href : !message || !chatContainsLink(message.body, href)) continue;
    seen.add(href);
    attachments.push({ kind, title, url: href, source });
  }
  return { text, attachments };
}
