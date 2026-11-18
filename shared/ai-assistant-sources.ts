const sourceReferences = /(`+)[\s\S]*?\1|[ \t]?(?<![\\!])\[([SW]\d+(?:[ ,]+[SW]\d+)*)\](?!\()/g;

export function readAssistantSourceLabels(text: string): Set<string> {
  const labels = new Set<string>();
  for (const [, , reference] of text.matchAll(sourceReferences)) {
    for (const label of reference?.match(/[SW]\d+/g) ?? []) labels.add(label);
  }
  return labels;
}

export function stripAssistantSourceLabels(text: string, labels: ReadonlySet<string>) {
  return text.replace(sourceReferences, (match, _code, reference: string | undefined) =>
    reference?.match(/[SW]\d+/g)?.every(label => labels.has(label)) ? '' : match).trim();
}
