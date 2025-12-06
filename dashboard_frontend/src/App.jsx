import { useState } from 'react'
import Header from './components/Header'
import Dashboard from './components/Dashboard'
import Courses from './components/Courses'
import CourseDetail from './components/CourseDetail'
import Analytics from './components/Analytics'
import { useData } from './hooks/useData'

const VIEWS = [
  { id: 'dashboard', label: 'Tổng quan', meta: 'Sức khỏe hệ thống' },
  { id: 'courses', label: 'Khóa học & Sinh viên', meta: 'Quản lý theo khóa' },
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
  const [selectedCourse, setSelectedCourse] = useState(null)
  const { data, loading, error, refetch } = useData()

  const handleCourseSelect = (course) => {
    setSelectedCourse(course)
    setActiveView('courses')
  }

  const handleBackToCourses = () => {
    setSelectedCourse(null)
  }

  const handleViewChange = (viewId) => {
    setActiveView(viewId)
    if (viewId !== 'courses') {
      setSelectedCourse(null)
    }
  }

  const renderView = () => {
    if (!data) return null

    switch (activeView) {
      case 'courses':
        if (selectedCourse) {
          return (
            <CourseDetail 
              course={selectedCourse} 
              onBack={handleBackToCourses}
              allCourseStudents={data.courseStudents || []}
            />
          )
        }
        return <Courses data={data} onCourseSelect={handleCourseSelect} />
      case 'analytics':
        return <Analytics data={data} />
      case 'dashboard':
      default:
        return <Dashboard data={data} onCourseSelect={handleCourseSelect} />
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
            onClick={() => handleViewChange(view.id)}
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
