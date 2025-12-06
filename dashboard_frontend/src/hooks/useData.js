import { useState, useEffect } from 'react'
import { buildApiUrl } from '../utils/api'

export const useData = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const res = await fetch(buildApiUrl('all'), {
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
        courseStudents: (payload.courseStudents || []).map(s => ({
          ...s,
          course_id: s.course_id,
          course_final_avg: Number(s.course_final_avg),
          course_submission_count: Number(s.course_submission_count || 0),
          course_late_ratio: Number(s.course_late_ratio),
          course_load: Number(s.course_load || 0),
          early_avg_grade: Number(s.early_avg_grade),
          early_submission_count: Number(s.early_submission_count || 0),
          early_late_ratio: Number(s.early_late_ratio),
          active_weeks_early: Number(s.active_weeks_early || 0),
          avg_delay_hours: Number(s.avg_delay_hours),
          submissions_last_14d: Number(s.submissions_last_14d || 0),
          submissions_last_30d: Number(s.submissions_last_30d || 0),
          assignment_completion_ratio: Number(s.assignment_completion_ratio),
          risk_probability: Number(s.risk_probability || 0),
          predicted_at_risk: Number(s.predicted_at_risk || 0)
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
