export const formatNumber = (num) => {
  if (num === null || num === undefined) return '0'
  return new Intl.NumberFormat('vi-VN').format(num)
}

export const formatPercent = (num) => {
  if (num === null || num === undefined) return '0%'
  return `${(num * 100).toFixed(1)}%`
}

export const formatGrade = (grade) => {
  if (grade === null || grade === undefined) return 'N/A'
  const value = Number(grade)
  if (Number.isNaN(value)) return 'N/A'
  return value.toFixed(1)
}

export const getRiskLevel = (probability) => {
  if (probability >= 0.7) return { level: 'Cao', color: '#dc2626', bg: '#fef2f2' }
  if (probability >= 0.4) return { level: 'Trung bình', color: '#f59e0b', bg: '#fffbeb' }
  return { level: 'Thấp', color: '#10b981', bg: '#f0fdf4' }
}

export const getGradeColor = (grade) => {
  if (grade >= 80) return '#10b981'
  if (grade >= 60) return '#3b82f6'
  if (grade >= 40) return '#f59e0b'
  return '#dc2626'
}
