import { getLocales } from 'react-native-localize'

import en from '../common/en_US.json'
import es from '../common/strings/es.json'

const allLocales = { en, es }

export const lstrings = { ...en } as const
export type LStrings = typeof lstrings
export type LStringsKey = keyof LStrings
export type LStringsValues = LStrings[LStringsKey]

// Set the language at boot:
const [firstLocale] = getLocales()
const { languageTag = 'en-US' } = firstLocale ?? {}
if (languageTag !== 'en-US') selectLocale(languageTag)

function mergeStrings(
  primary: Record<string, string>,
  secondary: Record<string, string>
): void {
  for (const str of Object.keys(secondary)) {
    if (secondary[str] !== '') {
      primary[str] = secondary[str]
    }
  }
}

// Locale formats can be in the form 'en', 'en-US', 'en_US', or 'enUS'
export function selectLocale(locale: string): boolean {
  // Break up local into language and region
  const normalizedLocale = locale
    .replace('-', '')
    .replace('-', '')
    .replace('_', '')

  // Find an exact match
  const exactMatch = allLocales[normalizedLocale as keyof typeof allLocales]
  if (exactMatch != null) {
    mergeStrings(lstrings, exactMatch)
    return true
  }

  const lang = normalizedLocale.slice(0, 2)

  // Find pure language match first (ie. find 'es' when 'esMX' is chosen)
  const shortMatch = allLocales[lang as keyof typeof allLocales]
  if (shortMatch != null) {
    mergeStrings(lstrings, shortMatch)
    return true
  }

  return false
}
