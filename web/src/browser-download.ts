export const parseDownloadFileName = (contentDisposition: string | null) => {
  const match = contentDisposition?.match(/filename="([^"]+)"/i)
    ?? contentDisposition?.match(/filename=([^;]+)/i);
  return match?.[1]?.trim() || null;
};

export const triggerFileDownload = (blob: Blob, fileName: string) => {
  if (typeof document === 'undefined') {
    throw new Error('Downloads require a browser context');
  }
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = objectUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body?.append(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(objectUrl);
  }
};
