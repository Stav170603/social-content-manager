import { describe, expect, it } from 'vitest'
import {
  isValidInstagramUsername,
  isValidIsraeliPhone,
  isValidOptionalEmail,
  normalizeInstagramUsername,
  normalizeIsraeliPhone,
} from './clientFields.js'

describe('client field normalization', () => {
  it('accepts and normalizes Israeli mobile phone formats', () => {
    expect(isValidIsraeliPhone('0501234567')).toBe(true)
    expect(isValidIsraeliPhone('+972 50-123-4567')).toBe(true)
    expect(normalizeIsraeliPhone('+972 50-123-4567')).toBe('0501234567')
  })

  it.each(['050ABC4567', '050123', '050123456789', ''])('rejects invalid phone %s', (phone) => {
    expect(isValidIsraeliPhone(phone)).toBe(false)
  })

  it('normalizes an optional Instagram username without @', () => {
    expect(normalizeInstagramUsername('@social.otzar')).toBe('social.otzar')
    expect(normalizeInstagramUsername('')).toBe('')
  })

  it.each(['social.otzar', '@social.otzar', 'stav_beauty', 'beauty.studio', ''])('accepts Instagram username %s', (username) => {
    expect(isValidInstagramUsername(username)).toBe(true)
  })

  it.each(['name with space', '@@social', 'name!', 'a'.repeat(31)])('rejects Instagram username %s', (username) => {
    expect(isValidInstagramUsername(username)).toBe(false)
  })

  it.each(['', '   ', 'client@example.com'])('accepts optional email %s', (email) => {
    expect(isValidOptionalEmail(email)).toBe(true)
  })

  it('rejects a non-empty malformed email', () => {
    expect(isValidOptionalEmail('not-an-email')).toBe(false)
  })
})
