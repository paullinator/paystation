import type { Theme } from '../types/theme'
import { scale } from './scaling'

/**
 * Palette object defines all the colors that can be used in the app.
 * Object keys are the color names and values are the hex codes.
 *
 * Key names should never imply where the colors is used.
 */
const palette = {
  white: '#FFFFFF',
  black: '#000000',
  darkGrey: '#1A1A1A',
  transparent: '#00000000'
}

/**
 * Theme object defines the app's theme. Object keys describe where a specific
 * color or style is used. They should NEVER imply the type of color or style
 * nor should then have a value that is a specific color. Instead the values are
 * always keys from the palette object.
 */
export const darkTheme: Theme = {
  rem(size: number): number {
    return Math.round(scale(16) * size)
  },
  isDark: true,
  appBackground: palette.black,
  cardBackground: palette.darkGrey,
  shadowColor: palette.black
}
