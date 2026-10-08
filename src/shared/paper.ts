/** 용지 규격. 크기는 세로 방향 기준 mm. */

export interface PaperSize {
  id: PaperId
  label: string
  widthMm: number
  heightMm: number
}

export const PAPER_SIZES = [
  { id: 'A4', label: 'A4 (210 × 297)', widthMm: 210, heightMm: 297 },
  { id: 'A5', label: 'A5 · 국판 (148 × 210)', widthMm: 148, heightMm: 210 },
  { id: 'A6', label: 'A6 · 문고판 (105 × 148)', widthMm: 105, heightMm: 148 },
  { id: 'B5', label: 'B5 (182 × 257)', widthMm: 182, heightMm: 257 },
  { id: 'B6', label: 'B6 (128 × 182)', widthMm: 128, heightMm: 182 },
  { id: 'shinguk', label: '신국판 (152 × 225)', widthMm: 152, heightMm: 225 },
  { id: '46', label: '4×6판 (128 × 188)', widthMm: 128, heightMm: 188 },
  { id: '46double', label: '4×6배판 (188 × 257)', widthMm: 188, heightMm: 257 },
  { id: 'crown', label: '크라운판 (176 × 248)', widthMm: 176, heightMm: 248 },
  { id: 'Letter', label: 'US Letter (216 × 279)', widthMm: 215.9, heightMm: 279.4 }
] as const satisfies readonly { id: string; label: string; widthMm: number; heightMm: number }[]

export type PaperId = (typeof PAPER_SIZES)[number]['id']

export function findPaper(id: string): PaperSize | undefined {
  return PAPER_SIZES.find((p) => p.id === id)
}
