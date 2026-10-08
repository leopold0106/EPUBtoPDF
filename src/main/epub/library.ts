/** 열려 있는 책 목록. 리소스 프로토콜이 책 ID로 책을 찾는 데 쓴다. */

import type { EpubBook } from './parse'

const books = new Map<string, EpubBook>()

export const library = {
  add(book: EpubBook): void {
    books.set(book.id, book)
  },
  get(id: string): EpubBook | undefined {
    return books.get(id)
  },
  remove(id: string): void {
    books.delete(id)
  },
  clear(): void {
    books.clear()
  }
}
