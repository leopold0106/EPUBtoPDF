import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/ipc'

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void window.api.getAppInfo().then(setInfo)
  }, [])

  return (
    <div className="app">
      <header className="toolbar">
        <button type="button" disabled>
          EPUB 열기
        </button>
        <span className="toolbar__file">열린 파일 없음</span>
        <button type="button" className="primary" disabled>
          PDF로 변환
        </button>
      </header>

      <main className="workspace">
        <aside className="settings">
          <h2>설정</h2>
          <p className="placeholder">용지, 여백, 글꼴, 본문 설정이 여기에 들어갑니다.</p>
        </aside>
        <section className="preview">
          <p className="placeholder">EPUB 파일을 열면 변환 결과 미리보기가 표시됩니다.</p>
        </section>
      </main>

      <footer className="statusbar">
        {info ? `${info.name} ${info.version} · Electron ${info.electron}` : '불러오는 중…'}
      </footer>
    </div>
  )
}
