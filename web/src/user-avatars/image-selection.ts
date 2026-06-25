export const maxSelectedAvatarImageBytes = 4 * 1024 * 1024;

export const readSelectedImageDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choose an image file.'));
      return;
    }
    if (file.size > maxSelectedAvatarImageBytes) {
      reject(new Error('Choose an image smaller than 4 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('Image could not be read.'));
    });
    reader.addEventListener('error', () => reject(new Error('Image could not be read.')));
    reader.readAsDataURL(file);
  });
