/** Windows 파일 이름에 쓸 수 없는 문자와 예약된 이름을 피한다. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 150)
    .trim()
  return cleaned === '' || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned) ? 'book' : cleaned
}
