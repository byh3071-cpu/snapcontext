export async function getPngDimensionsFromDataUrl(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  const width = bitmap.width
  const height = bitmap.height
  bitmap.close()
  return { width, height }
}
