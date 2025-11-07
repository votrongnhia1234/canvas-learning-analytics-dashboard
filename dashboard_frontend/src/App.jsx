import { useState } from 'react'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import Students from './components/Students'
import Courses from './components/Courses'
import Analytics from './components/Analytics'
import { useData } from './hooks/useData'

const VIEWS = [
  { id: 'dashboard', label: 'Tổng quan', meta: 'Sức khỏe hệ thống' },
  { id: 'students', label: 'Sinh viên', meta: 'Theo dõi cá nhân' },
  { id: 'courses', label: 'Khóa học', meta: 'So sánh hiệu suất' },
  { id: 'analytics', label: 'Phân tích nâng cao', meta: 'Xu hướng & phân bố' }
]

const LoadingState = () => (
  <div className="la-state la-state--loading">
    <span className="la-spinner" aria-hidden="true" />
    <p>Đang đồng bộ dữ liệu từ Canvas DWH...</p>
  </div>
)

const ErrorState = ({ message, onRetry }) => (
  <div className="la-state la-state--error">
    <div className="la-state__icon" aria-hidden="true">⚠️</div>
    <h2>Không thể tải dữ liệu</h2>
    <p>{message}</p>
    <button className="la-button" onClick={onRetry}>
      Thử lại
    </button>
  </div>
)

function App() {
  const [activeView, setActiveView] = useState('dashboard')
  const { data, loading, error, refetch } = useData()

  const renderView = () => {
    if (!data) return null

    switch (activeView) {
      case 'students':
        return <Students data={data} />
      case 'courses':
        return <Courses data={data} />
      case 'analytics':
        return <Analytics data={data} />
      case 'dashboard':
      default:
        return <Dashboard data={data} />
    }
  }

  return (
    <div className="la-app">
      <Header onRefresh={refetch} loading={loading} />

      <nav className="la-tabs" role="tablist" aria-label="Chọn loại nội dung">
        {VIEWS.map(view => (
          <button
            key={view.id}
            type="button"
            role="tab"
            aria-selected={activeView === view.id}
            className={`la-tabs__item ${activeView === view.id ? 'is-active' : ''}`}
            onClick={() => setActiveView(view.id)}
          >
            <span className="la-tabs__label">{view.label}</span>
            <span className="la-tabs__meta">{view.meta}</span>
          </button>
        ))}
      </nav>

      <main className="la-content">
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} onRetry={refetch} />}
        {!loading && !error && renderView()}
      </main>
    </div>
  )
}

export default App
