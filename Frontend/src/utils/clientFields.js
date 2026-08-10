export const PHONE_ERROR = 'יש להזין מספר טלפון ישראלי תקין'
export const INSTAGRAM_ERROR = 'יש להזין שם משתמש Instagram תקין'

export function normalizeIsraeliPhone(value = '') {
  const trimmed = String(value).trim()
  if (!/^[+0-9\s-]*$/.test(trimmed)) return trimmed
  const compact = trimmed.replace(/[\s-]/g, '')
  return compact.startsWith('+9725') ? `0${compact.slice(4)}` : compact
}

export function isValidIsraeliPhone(value) {
  return /^05\d{8}$/.test(normalizeIsraeliPhone(value))
}

export function normalizeInstagramUsername(value = '') {
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

export function isValidInstagramUsername(value) {
  const normalized = normalizeInstagramUsername(value)
  return !normalized || /^[A-Za-z0-9._]{1,30}$/.test(normalized)
}

export function isValidOptionalEmail(value = '') {
  const normalized = String(value).trim()
  return !normalized || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

export function validateClientFields({ phone, instagramUsername, email }) {
  return {
    email: isValidOptionalEmail(email) ? '' : 'יש להזין כתובת אימייל תקינה',
    phone: isValidIsraeliPhone(phone) ? '' : PHONE_ERROR,
    instagramUsername: isValidInstagramUsername(instagramUsername) ? '' : INSTAGRAM_ERROR,
  }
}
