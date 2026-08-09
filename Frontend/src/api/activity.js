import api from '../services/api.js'

export async function getActivity({ limit = 50, type, signal, suppressGlobalErrorToast = false } = {}) {
  const response = await api.get('/activity', {
    params: { limit, ...(type ? { type } : {}) },
    signal,
    suppressGlobalErrorToast,
  })
  return response.data
}
