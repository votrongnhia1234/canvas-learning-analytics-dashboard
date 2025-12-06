const rawBase = import.meta.env.VITE_API_BASE_URL?.trim() || ''
const normalizedBase = rawBase ? rawBase.replace(/\/$/, '') : ''

const API_ROOT = normalizedBase || '/api'

export const buildApiUrl = (path = '') => {
  if (!path) return API_ROOT
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_ROOT}${normalizedPath}`
}

export const getApiRoot = () => API_ROOT
