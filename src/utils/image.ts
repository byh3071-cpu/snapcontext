export function loadImageFromDataUrl(
  dataUrl: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지를 디코딩하지 못했습니다.'))
    img.src = dataUrl
  })
}

export async function getImageDimensionsFromDataUrl(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  const img = await loadImageFromDataUrl(dataUrl)
  return { width: img.naturalWidth, height: img.naturalHeight }
}
