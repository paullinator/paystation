export type ImageProp = { uri: string } | number

export interface GradientCoords {
  x: number
  y: number
}

export interface ThemeGradientParams {
  colors: string[]
  start: GradientCoords
  end: GradientCoords
}

export interface ThemeShadowParams {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
}

export interface TextShadowParams {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
}

export interface Theme {
  // The app scaling factor, which is the height of "normal" text:
  rem: (size: number) => number

  // Used to control the OS status bar, modal blur,
  // and other binary light / dark choices:
  isDark: boolean

  // Background
  appBackground: string
  cardBackground: string

  // Colors
  shadowColor: string
}

export const themeNoShadow: ThemeShadowParams = {
  shadowColor: '#000000',
  shadowOffset: {
    width: 0,
    height: 0
  },
  shadowOpacity: 0,
  shadowRadius: 0
}

export const textNoShadow: TextShadowParams = {
  shadowColor: '#000000',
  shadowOffset: {
    width: 0,
    height: 0
  },
  shadowOpacity: 0,
  shadowRadius: 0
}
