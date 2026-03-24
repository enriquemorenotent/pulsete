export type PendingImportStage = 'starting' | 'running';

export const formatAssistantElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const getPendingImportStatusCopy = (
  stage: PendingImportStage,
  elapsedMs: number,
) => {
  if (stage === 'starting') {
    return {
      title: 'Starting log import',
      detail: 'Sending the attached log files and preparing the import request.',
      hint: 'The assistant will append imported messages to this buffer when parsing finishes.',
    };
  }

  if (elapsedMs < 30_000) {
    return {
      title: 'Importing logs',
      detail: 'Parsing the attached logs and matching messages to this buffer.',
      hint: 'Imported messages will appear here once the import completes.',
    };
  }

  if (elapsedMs < 120_000) {
    return {
      title: 'Importing logs',
      detail: 'Still parsing the attached logs. Larger files can take a minute or two.',
      hint: 'The import has not failed unless an error appears in this panel.',
    };
  }

  return {
    title: 'Importing logs',
    detail: 'Still working. Large or messy logs can take several minutes to parse.',
    hint: 'The import has not failed unless an error appears in this panel. Use Stop import to cancel it.',
  };
};
