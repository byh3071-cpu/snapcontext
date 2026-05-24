export async function captureVisible(): Promise<{
  imageData: string
  captureType: 'visible'
}> {
  const currentWindow = await chrome.windows.getCurrent()
  if (currentWindow.id === undefined) {
    throw new Error('현재 창을 확인할 수 없습니다.')
  }
  const dataUrl = await chrome.tabs.captureVisibleTab(currentWindow.id, {
    format: 'png'
  })
  return { imageData: dataUrl, captureType: 'visible' }
}
