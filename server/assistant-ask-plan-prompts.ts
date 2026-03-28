export const isAffirmativePrompt = (prompt: string) =>
  /^(?:yes|yeah|yep|yup|correct|right|exactly|sure|please do|that one|that chat|the selected buffer|search that one)\b/.test(prompt);

export const isNegativePrompt = (prompt: string) =>
  /^(?:no|nope|nah|not that|not this|other one|someone else)\b/.test(prompt);
