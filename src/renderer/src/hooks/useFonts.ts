import { useCallback, useEffect, useState } from 'react'
import { userFontUrl, type UserFont } from '@shared/fonts'

type QueryLocalFonts = () => Promise<{ family: string }[]>

/** 컴퓨터에 설치된 글꼴 계열 이름 (Local Font Access API). 쓸 수 없으면 빈 목록. */
async function systemFamilies(): Promise<string[]> {
  const query = (window as unknown as { queryLocalFonts?: QueryLocalFonts }).queryLocalFonts
  if (!query) return []
  try {
    const fonts = await query()
    return [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b, 'ko'))
  } catch {
    return []
  }
}

const FACE_STYLE_ID = 'user-font-faces'

/** 앱 화면에서도 사용자 글꼴로 견본을 보여줄 수 있게 @font-face를 넣는다. */
function installFaces(fonts: UserFont[]): void {
  let style = document.getElementById(FACE_STYLE_ID)
  if (!style) {
    style = document.createElement('style')
    style.id = FACE_STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = fonts
    .map(
      (f) =>
        `@font-face { font-family: ${JSON.stringify(f.family)}; src: url(${JSON.stringify(userFontUrl(f.id))});` +
        ` font-weight: ${f.weight}; font-style: ${f.italic ? 'italic' : 'normal'}; }`
    )
    .join('\n')
}

export function useFonts(): {
  system: string[] | null
  user: UserFont[]
  add(): Promise<string | null>
  remove(id: string): Promise<void>
} {
  const [system, setSystem] = useState<string[] | null>(null)
  const [user, setUser] = useState<UserFont[]>([])

  const refresh = useCallback(async () => {
    const list = await window.api.listUserFonts()
    installFaces(list)
    setUser(list)
  }, [])

  useEffect(() => {
    void systemFamilies().then(setSystem)
    void refresh()
  }, [refresh])

  /** 글꼴 파일을 추가한다. 실패한 파일이 있으면 그 설명을 돌려준다. */
  const add = useCallback(async (): Promise<string | null> => {
    const result = await window.api.addUserFonts()
    if (!result) return null
    await refresh()
    return result.failed.length > 0 ? result.failed.map((f) => `${f.fileName}: ${f.reason}`).join('\n') : null
  }, [refresh])

  const remove = useCallback(
    async (id: string) => {
      await window.api.removeUserFont(id)
      await refresh()
    },
    [refresh]
  )

  return { system, user, add, remove }
}
