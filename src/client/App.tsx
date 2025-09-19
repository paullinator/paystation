import React from 'react'
import { Image, View } from 'react-native'
import { cacheStyles } from 'react-native-patina'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom'

import { useTheme } from './themes/ThemeContext'
import type { Theme } from './types/theme'

const Home: React.FC = () => {
  const theme = useTheme()
  const styles = getStyles(theme)

  return (
    <View style={styles.app}>
      <View style={styles.logoContainer}>
        <Image
          source={{ uri: '/assets/images/edge_logo.png' }}
          style={styles.edgeLogo}
          resizeMode="contain"
        />
      </View>
    </View>
  )
}

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  )
}

/**
 * Component styles should always use the theme object for any colors and
 * never use hardcoded colors. In addition, component sizes should always use
 * theme.rem() with the exception of since pixel size horizontal or vertical
 * lines. Padding and margin should always use theme.rem() as well.
 */
const getStyles = cacheStyles((theme: Theme) => ({
  app: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.appBackground
  },
  logoContainer: {
    alignItems: 'center',
    padding: theme.rem(2),
    backgroundColor: theme.cardBackground,
    borderRadius: theme.rem(1),
    shadowColor: theme.shadowColor,
    shadowOffset: { width: 0, height: theme.rem(1.25) },
    shadowOpacity: 0.1,
    shadowRadius: theme.rem(1.5),
    elevation: 10
  },
  edgeLogo: {
    height: theme.rem(4),
    width: theme.rem(12.5)
  }
}))

export default App
