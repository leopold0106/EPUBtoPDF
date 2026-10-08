import { useState } from 'react'
import { fontDisplayName } from '@shared/font-names'
import { userFontLabel, type UserFont } from '@shared/fonts'

interface Props {
  family: string
  system: string[] | null
  user: UserFont[]
  onPick(family: string): void
  onAdd(): Promise<string | null>
  onRemove(id: string): Promise<void>
}

/** 글꼴 견본, 설치 여부 경고, 사용자 글꼴 목록과 추가 단추. */
export function FontExtras({ family, system, user, onPick, onAdd, onRemove }: Props): React.JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const userFamilies = new Set(user.map((f) => f.family))
  const known = userFamilies.has(family) || system === null || system.length === 0 || system.includes(family)
  // 같은 계열의 굵기·기울임 파일은 한 줄로 묶어 보여준다.
  const groups = [...new Map(user.map((f) => [f.family, user.filter((g) => g.family === f.family)])).entries()]

  return (
    <div className="font-extras">
      <div className="font-sample" style={{ fontFamily: `${JSON.stringify(family)}, sans-serif` }}>
        가나다라 마바사 ABC abc 123
      </div>
      {!known && (
        <p className="issue issue--warning">이 컴퓨터에서 "{fontDisplayName(family)}" 글꼴을 찾지 못했습니다. 다른 글꼴로 대신 인쇄됩니다.</p>
      )}

      <div className="font-extras__head">
        <span>추가한 글꼴</span>
        <button
          type="button"
          className="link"
          onClick={() => {
            setError(null)
            void onAdd().then(setError)
          }}
        >
          글꼴 파일 추가…
        </button>
      </div>
      {error && <p className="issue issue--error">{error}</p>}
      {groups.length === 0 ? (
        <p className="panel-note">TTF, OTF, WOFF 파일을 추가하면 이 앱에서만 쓸 수 있습니다 (설치하지 않아도 됩니다).</p>
      ) : (
        <ul className="user-fonts">
          {groups.map(([name, faces]) => (
            <li key={name} className={name === family ? 'user-fonts__item user-fonts__item--on' : 'user-fonts__item'}>
              <button type="button" className="user-fonts__name" style={{ fontFamily: JSON.stringify(name) }} onClick={() => onPick(name)}>
                {userFontLabel(faces[0]!)}
                {faces.length > 1 && <span className="user-fonts__count"> · {faces.length}종</span>}
              </button>
              <button
                type="button"
                className="user-fonts__remove"
                title="목록에서 빼기"
                onClick={() => void Promise.all(faces.map((f) => onRemove(f.id)))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
