export function getPlatform () {
  return window.services?.getPlatform?.() || 'win32'
}

export function getPlatformName () {
  const p = getPlatform()
  if (p === 'win32') return 'Windows'
  if (p === 'darwin') return 'macOS'
  return 'Linux'
}

export function getPathSeparator () {
  return window.services?.getPathSeparator?.() || ';'
}

export function isWindows () {
  return getPlatform() === 'win32'
}

export function getExamplePath () {
  if (isWindows()) return 'C:\\Program Files\\MyApp'
  return '/usr/local/bin'
}

export function getAdminHint () {
  if (isWindows()) return '请以管理员身份运行 uTools'
  return '需要输入管理员密码进行授权'
}

export function getValueLengthLimit () {
  return window.services?.getValueLengthLimit?.() || null
}
