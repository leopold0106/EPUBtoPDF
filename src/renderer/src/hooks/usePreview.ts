import { useEffect, useRef, useState } from 'react'
import type { BookEdits } from '@shared/edits'
import type { PreviewRequest, PreviewResult } from '@shared/ipc'
import type { Settings } from '@shared/settings'

export interface PreviewState {
  result: PreviewResult | null
  error: string | null
  loading: boolean
}

interface Args {
  bookId: string | null
  settings: Settings
  edits: BookEdits
  request: PreviewRequest
  /** 설정 오류가 있으면 미리보기를 만들지 않는다. */
  enabled: boolean
  delayMs: number
}

/**
 * 설정이 바뀌면 잠시 기다렸다가 미리보기를 만든다. 만드는 중에 또 바뀌면 끝난 뒤 최신 값으로 한 번만 다시 만든다.
 */
export function usePreview({ bookId, settings, edits, request, enabled, delayMs }: Args): PreviewState {
  const [state, setState] = useState<PreviewState>({ result: null, error: null, loading: false })
  const latest = useRef({ bookId, settings, edits, request, enabled })
  latest.current = { bookId, settings, edits, request, enabled }
  const running = useRef(false)
  const again = useRef(false)
  const generation = useRef(0)

  const key = JSON.stringify([bookId, settings, edits, request, enabled])

  useEffect(() => {
    // 다른 책으로 바뀌면 이전 결과를 버린다.
    setState({ result: null, error: null, loading: false })
    generation.current++
  }, [bookId])

  useEffect(() => {
    if (!bookId || !enabled) return
    const run = async (): Promise<void> => {
      if (running.current) {
        again.current = true
        return
      }
      running.current = true
      const gen = generation.current
      const args = latest.current
      setState((s) => ({ ...s, loading: true }))
      try {
        if (!args.bookId || !args.enabled) return
        const res = await window.api.preview(args.bookId, args.settings, args.edits, args.request)
        if (gen !== generation.current) return
        setState(res.ok ? { result: res.value, error: null, loading: false } : { result: null, error: res.error, loading: false })
      } finally {
        running.current = false
        if (again.current) {
          again.current = false
          void run()
        } else {
          setState((s) => ({ ...s, loading: false }))
        }
      }
    }
    const timer = setTimeout(() => void run(), delayMs)
    return () => clearTimeout(timer)
    // key가 모든 입력을 담고 있다.
  }, [key, delayMs])

  return state
}
