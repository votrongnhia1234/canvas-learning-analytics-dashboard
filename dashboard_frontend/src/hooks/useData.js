import { useState, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || ''

export const useData = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const res = await fetch(`${API_BASE}/api/all`, {
        headers: {
          'Content-Type': 'application/json',
          ...(import.meta.env.VITE_API_KEY ? { 'X-API-Key': import.meta.env.VITE_API_KEY } : {})
        }
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const payload = await res.json()
      
      // Transform data
      const transformedData = {
        overview: payload.overview,
        courses: payload.courses.map(c => ({
          ...c,
          avg_grade: Number(c.avg_grade),
          late_ratio: Number(c.late_ratio),
          at_risk_ratio: Number(c.at_risk_ratio),
          student_count: Number(c.student_count),
          total_submissions: Number(c.total_submissions || 0)
        })),
        students: (payload.students || payload.topStudents || []).map(s => ({
          ...s,
          avg_grade: Number(s.avg_grade),
          risk_probability: Number(s.risk_probability)
        })),
        distribution: payload.distribution.map(d => ({
          ...d,
          count: Number(d.count),
          avg_grade: Number(d.avg_grade)
        })),
        trends: payload.trends.map(t => ({
          ...t,
          week: new Date(t.week),
          avg_grade: Number(t.avg_grade),
          late_ratio: Number(t.late_ratio),
          submissions: Number(t.submissions)
        })),
        heatmap: payload.heatmap.map(h => ({
          ...h,
          late_ratio: Number(h.late_ratio)
        })),
        histogram: payload.histogram.map(h => ({
          ...h,
          bucket: Number(h.bucket),
          count: Number(h.count)
        })),
        // New data
        assignments: payload.assignments || [],
        courseComparison: payload.courseComparison || [],
        topPerformers: payload.topPerformers || [],
        realtimeActivity: payload.realtimeActivity || {
          submissions_24h: 0,
          submissions_7d: 0,
          active_students_24h: 0,
          active_students_7d: 0
        }
      }

      setData(transformedData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  return { data, loading, error, refetch: fetchData }
}
