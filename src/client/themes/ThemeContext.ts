import { cacheStyles, makeThemeContext } from 'react-native-patina'

import type { Theme } from '../types/theme'
import { darkTheme } from './darkTheme'

export type { Theme }
export { cacheStyles }

/**
 * Utility for declaring `withTheme` components.
 */
export interface ThemeProps {
  theme: Theme
}

// Provide the theme context methods:
const themeContext = makeThemeContext(darkTheme)
export const {
  ThemeProvider,
  useTheme,
  withTheme,
  changeTheme,
  getTheme,
  watchTheme
} = themeContext
