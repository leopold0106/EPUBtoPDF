import { describe, expect, it } from 'vitest'
import { IpcChannels } from '@shared/ipc'

describe('IpcChannels', () => {
  it('채널 이름이 서로 겹치지 않는다', () => {
    const names = Object.values(IpcChannels)
    expect(new Set(names).size).toBe(names.length)
  })
})
