import { useCallback, useState } from 'react'

interface History<T> {
  past: T[]
  present: T
  future: T[]
}

const LIMIT = 100

/** 되돌리기(Ctrl+Z)와 다시 하기를 지원하는 상태. */
export function useUndoable<T>(initial: T): {
  value: T
  set(next: T | ((prev: T) => T)): void
  undo(): void
  redo(): void
  /** 기록을 지우고 새 값으로 시작한다 (다른 책을 열 때). */
  reset(value: T): void
  canUndo: boolean
  canRedo: boolean
} {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [] })

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setH((cur) => {
      const value = typeof next === 'function' ? (next as (prev: T) => T)(cur.present) : next
      if (Object.is(value, cur.present)) return cur
      return { past: [...cur.past, cur.present].slice(-LIMIT), present: value, future: [] }
    })
  }, [])
  const undo = useCallback(() => {
    setH((cur) => (cur.past.length === 0 ? cur : { past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1]!, future: [cur.present, ...cur.future] }))
  }, [])
  const redo = useCallback(() => {
    setH((cur) => (cur.future.length === 0 ? cur : { past: [...cur.past, cur.present], present: cur.future[0]!, future: cur.future.slice(1) }))
  }, [])
  const reset = useCallback((value: T) => setH({ past: [], present: value, future: [] }), [])

  return { value: h.present, set, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 }
}
