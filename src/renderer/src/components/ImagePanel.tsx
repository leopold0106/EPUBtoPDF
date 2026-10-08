import type { BookSummary } from '@shared/book'
import type { ImageInfo } from '@shared/render'

interface Props {
  book: BookSummary
  images: ImageInfo[] | null
  error: string | null
  hidden: ReadonlySet<string>
  onToggle(key: string): void
  onSetAll(hide: boolean): void
}

/** 책에 든 그림을 장별 썸네일로 보여주고, 눌러서 변환 결과에서 빼거나 다시 넣는다. */
export function ImagePanel({ book, images, error, hidden, onToggle, onSetAll }: Props): React.JSX.Element {
  if (error) return <p className="panel-note panel-note--error">{error}</p>
  if (!images) return <p className="panel-note">그림을 찾는 중…</p>
  if (images.length === 0) return <p className="panel-note">이 책에는 그림이 없습니다.</p>

  const groups = new Map<number, ImageInfo[]>()
  for (const img of images) groups.set(img.spineIndex, [...(groups.get(img.spineIndex) ?? []), img])
  const hiddenCount = images.filter((i) => hidden.has(i.key)).length

  return (
    <div className="image-panel">
      <div className="image-panel__summary">
        <span>
          그림 {images.length}개{hiddenCount > 0 && ` · ${hiddenCount}개 뺌`}
        </span>
        <button type="button" className="link" onClick={() => onSetAll(true)} disabled={hiddenCount === images.length}>
          모두 빼기
        </button>
        <button type="button" className="link" onClick={() => onSetAll(false)} disabled={hiddenCount === 0}>
          모두 넣기
        </button>
      </div>
      <p className="panel-note">그림을 누르면 PDF에서 빠집니다 (바로 밑의 그림 설명도 함께). 다시 누르면 되돌아옵니다.</p>
      {[...groups].map(([spineIndex, list]) => (
        <section key={spineIndex} className="image-panel__group">
          <h4>{groupTitle(book, spineIndex, list)}</h4>
          <div className="image-panel__grid">
            {list.map((img) => {
              const off = hidden.has(img.key)
              return (
                <button
                  key={img.key}
                  type="button"
                  className={`thumb${off ? ' thumb--hidden' : ''}`}
                  onClick={() => onToggle(img.key)}
                  title={`${img.alt || '그림'} — ${off ? '눌러서 다시 넣기' : '눌러서 빼기'}`}
                  aria-pressed={off}
                >
                  {img.src ? <img src={img.src} alt={img.alt} loading="lazy" /> : <span className="thumb__missing">?</span>}
                  {off && <span className="thumb__badge">뺌</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

/** 목차 제목이 없으면, 표지 그림이 든 문서는 '표지', 나머지는 '문서 N'. */
function groupTitle(book: BookSummary, spineIndex: number, list: ImageInfo[]): string {
  const title = book.spine[spineIndex]?.title
  if (title) return title
  const isCover =
    book.coverPath !== undefined &&
    list.some((img) => {
      try {
        return decodeURIComponent(new URL(img.src).pathname).replace(/^\/+/, '') === book.coverPath
      } catch {
        return false
      }
    })
  return isCover ? '표지' : `문서 ${spineIndex + 1}`
}
