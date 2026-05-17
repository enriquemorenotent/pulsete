export type ImageDimensions = {
  height: number;
  width: number;
};

export type Point = {
  x: number;
  y: number;
};

export type CropSourceRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

export const cropViewportSize = 280;
export const croppedImageOutputSize = 512;

export const clampPan = (
  pan: Point,
  dimensions: ImageDimensions,
  zoom: number,
  viewportSize = cropViewportSize,
): Point => {
  const rendered = resolveRenderedImageSize(dimensions, zoom, viewportSize);
  return {
    x: clamp(pan.x, resolveMinPan(rendered.width, viewportSize), resolveMaxPan(rendered.width, viewportSize)),
    y: clamp(pan.y, resolveMinPan(rendered.height, viewportSize), resolveMaxPan(rendered.height, viewportSize)),
  };
};

export const resolveCropSourceRect = (
  dimensions: ImageDimensions,
  pan: Point,
  zoom: number,
  viewportSize = cropViewportSize,
): CropSourceRect => {
  const rendered = resolveRenderedImageSize(dimensions, zoom, viewportSize);
  const left = (viewportSize - rendered.width) / 2 + pan.x;
  const top = (viewportSize - rendered.height) / 2 + pan.y;
  const x = clamp((-left / rendered.width) * dimensions.width, 0, dimensions.width);
  const y = clamp((-top / rendered.height) * dimensions.height, 0, dimensions.height);
  const width = clamp((viewportSize / rendered.width) * dimensions.width, 1, dimensions.width - x);
  const height = clamp((viewportSize / rendered.height) * dimensions.height, 1, dimensions.height - y);
  return { x, y, width, height };
};

export const cropImageDataUrl = async (
  source: string,
  dimensions: ImageDimensions,
  pan: Point,
  zoom: number,
) => {
  const image = await loadImage(source);
  const rect = resolveCropSourceRect(dimensions, clampPan(pan, dimensions, zoom), zoom);
  const canvas = document.createElement('canvas');
  canvas.width = croppedImageOutputSize;
  canvas.height = croppedImageOutputSize;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image editor is not available');
  }
  context.drawImage(
    image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    croppedImageOutputSize,
    croppedImageOutputSize,
  );
  return canvas.toDataURL('image/png');
};

const resolveRenderedImageSize = (
  dimensions: ImageDimensions,
  zoom: number,
  viewportSize: number,
) => {
  const scale = Math.max(viewportSize / dimensions.width, viewportSize / dimensions.height) * zoom;
  return {
    height: dimensions.height * scale,
    width: dimensions.width * scale,
  };
};

const resolveMinPan = (renderedSize: number, viewportSize: number) =>
  Math.min(0, (viewportSize - renderedSize) / 2);

const resolveMaxPan = (renderedSize: number, viewportSize: number) =>
  Math.max(0, (renderedSize - viewportSize) / 2);

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const loadImage = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be loaded'));
    image.src = source;
  });
