const fs = require('fs')
const platform = process.platform

let handler
if (platform === 'win32') {
  handler = require('./platforms/windows')
} else if (platform === 'darwin') {
  handler = require('./platforms/macos')
} else {
  handler = require('./platforms/linux')
}

window.services = {
  getPlatform () {
    return platform
  },

  getPathSeparator () {
    return platform === 'win32' ? ';' : ':'
  },

  getEnvironmentVariables (isSystemScope = false) {
    return handler.getEnvironmentVariables(isSystemScope)
  },

  getAllEnvironmentVariables (isSystemScope = false) {
    return handler.getAllEnvironmentVariables(isSystemScope)
  },

  canModifySystemEnvironment () {
    return handler.canModifySystemEnvironment()
  },

  setEnvironmentVariable (name, value, isSystemScope = false) {
    return handler.setEnvironmentVariable(name, value, isSystemScope)
  },

  removeEnvironmentVariable (name, isSystemScope = false) {
    return handler.removeEnvironmentVariable(name, isSystemScope)
  },

  getEnvironmentVariable (name) {
    return handler.getEnvironmentVariable(name)
  },

  refreshEnvironment () {
    return handler.refreshEnvironment()
  },

  getShellConfigInfo () {
    return handler.getShellConfigInfo()
  },

  getValueLengthLimit () {
    return handler.getValueLengthLimit()
  },

  openSystemEnvSettings () {
    if (handler.openSystemEnvSettings) {
      handler.openSystemEnvSettings()
    }
  },

  readFileText (filePath) {
    return fs.readFileSync(filePath, 'utf8')
  },

  writeFileText (filePath, content) {
    fs.writeFileSync(filePath, content, 'utf8')
  }
}
