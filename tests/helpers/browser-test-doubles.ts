const coerceTestDouble = <Target, Source extends object>(source: Source): Target & Source => {
  const value: unknown = source;
  return value as Target & Source;
};

export const createDocumentTestDouble = <Source extends object>(source: Source) =>
  coerceTestDouble<Document, Source>(source);

export const createAudioContextTestDouble = <Source extends object>(source: Source) =>
  coerceTestDouble<AudioContext, Source>(source);
