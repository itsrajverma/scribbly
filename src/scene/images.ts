const cache = new Map<string, HTMLImageElement>();
let onLoadCallback: () => void = () => {};

export const setImageLoadCallback = (cb: () => void) => {
  onLoadCallback = cb;
};

/** Returns a loaded image or undefined while it's loading. */
export const getImage = (dataURL: string): HTMLImageElement | undefined => {
  if (!dataURL) return undefined;
  let img = cache.get(dataURL);
  if (!img) {
    img = new Image();
    img.onload = () => onLoadCallback();
    img.src = dataURL;
    cache.set(dataURL, img);
  }
  return img.complete && img.naturalWidth ? img : undefined;
};

export const loadImage = (dataURL: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(dataURL, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = dataURL;
  });

export const fileToDataURL = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

/** Downscale very large images so the scene stays light enough for localStorage. */
export const prepareImage = async (file: Blob, maxSize = 1600) => {
  const dataURL = await fileToDataURL(file);
  const img = await loadImage(dataURL);
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 || file.type === "image/svg+xml" || file.type === "image/gif") {
    return { dataURL, width: img.naturalWidth, height: img.naturalHeight };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL(file.type === "image/png" ? "image/png" : "image/jpeg", 0.9);
  await loadImage(out);
  return { dataURL: out, width: canvas.width, height: canvas.height };
};
