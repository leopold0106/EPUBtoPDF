/** 인쇄된 PDF 후처리: 문서 정보(제목, 저자 등)를 넣는다. */

import { PDFDocument } from 'pdf-lib'
import type { BookMetadata } from '@shared/book'

export async function finalizePdf(raw: Uint8Array, metadata: BookMetadata): Promise<{ pdf: Uint8Array; pageCount: number }> {
  const doc = await PDFDocument.load(raw, { updateMetadata: false })
  doc.setTitle(metadata.title, { showInWindowTitleBar: true })
  if (metadata.creators.length > 0) doc.setAuthor(metadata.creators.join(', '))
  if (metadata.publisher) doc.setSubject(metadata.publisher)
  if (metadata.language) doc.setLanguage(metadata.language)
  doc.setCreator('EPUBtoPDF')
  doc.setProducer('EPUBtoPDF (Chromium)')
  const now = new Date()
  doc.setCreationDate(now)
  doc.setModificationDate(now)
  return { pdf: await doc.save(), pageCount: doc.getPageCount() }
}
