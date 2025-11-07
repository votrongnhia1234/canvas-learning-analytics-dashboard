const Header = ({ onRefresh, loading }) => {
  const formatter = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <header className="la-header">
      <div className="la-header__intro">
        <p className="la-eyebrow">Canvas LMS • Learning Analytics</p>
        <h1>Learning Analytics Hub</h1>
        <p>Giám sát sức khỏe học tập, xác định rủi ro và ưu tiên hành động cho toàn hệ thống.</p>
      </div>
      <div className="la-header__actions">
        <div className="la-header__meta">
          <span>Cập nhật gần nhất</span>
          <strong>{formatter.format(new Date())}</strong>
        </div>
        <button
          type="button"
          className="la-button la-button--primary"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading && <span className="la-spinner la-spinner--inline" aria-hidden="true" />}
          Làm mới dữ liệu
        </button>
      </div>
    </header>
  )
}

export default Header
