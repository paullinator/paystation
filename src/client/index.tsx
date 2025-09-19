import { AppRegistry } from 'react-native'

import App from './App'

// Register the app
AppRegistry.registerComponent('paystation', () => App)

// Run the app
AppRegistry.runApplication('paystation', {
  rootTag: document.getElementById('root')
})
