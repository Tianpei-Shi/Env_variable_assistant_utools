const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { exec } = require('node:child_process')
const { promisify } = require('node:util')
const execAsync = promisify(exec)

const BLOCK_START = '# === uTools Env Assistant START ==='
const BLOCK_END = '# === uTools Env Assistant END ==='
const ETC_ENVIRONMENT = '/etc/environment'

/**
 * 检测当前用户使用的 shell 及其配置文件路径。
 * macOS 默认 zsh，Linux 默认 bash；同时兼顾 SHELL 环境变量。
 */
function detectShellConfigPath () {
  const home = os.homedir()
  const shell = process.env.SHELL || ''
  const shellName = path.basename(shell)

  if (shellName === 'zsh') {
    return path.join(home, '.zshrc')
  }
  if (shellName === 'fish') {
    return path.join(home, '.config', 'fish', 'config.fish')
  }

  if (process.platform === 'darwin') {
    // macOS 10.15+ 默认 zsh
    const zshrc = path.join(home, '.zshrc')
    if (fs.existsSync(zshrc)) return zshrc
    const bashProfile = path.join(home, '.bash_profile')
    if (fs.existsSync(bashProfile)) return bashProfile
    return zshrc
  }

  // Linux 默认 bash
  const bashrc = path.join(home, '.bashrc')
  if (fs.existsSync(bashrc)) return bashrc
  const profile = path.join(home, '.profile')
  if (fs.existsSync(profile)) return profile
  return bashrc
}

function ensureFileExists (filePath) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, '', 'utf8')
  }
}

/**
 * 读取配置文件中标记块内的所有变量。
 * 返回 [{ name, value, type: 'STRING' }]
 */
function readManagedVariables (configPath) {
  ensureFileExists(configPath)
  const content = fs.readFileSync(configPath, 'utf8')
  const lines = content.split('\n')

  let inBlock = false
  const variables = []

  for (const line of lines) {
    if (line.trim() === BLOCK_START) { inBlock = true; continue }
    if (line.trim() === BLOCK_END) { inBlock = false; continue }
    if (!inBlock) continue

    // fish shell: set -gx NAME "VALUE"
    const fishMatch = line.match(/^\s*set\s+-gx\s+(\S+)\s+"(.*)"/)
    if (fishMatch) {
      variables.push({ name: fishMatch[1], value: fishMatch[2], type: 'STRING' })
      continue
    }

    // bash / zsh: export NAME="VALUE"
    const match = line.match(/^\s*export\s+([^=]+)="(.*)"/)
    if (match) {
      variables.push({ name: match[1].trim(), value: match[2], type: 'STRING' })
    }
  }

  return variables
}

/**
 * 构造一行 export 语句（自动区分 fish shell）。
 */
function buildExportLine (configPath, name, value) {
  if (configPath.includes('config.fish')) {
    return `set -gx ${name} "${value}"`
  }
  return `export ${name}="${value}"`
}

/**
 * 在标记块中写入或更新一个变量。
 */
function writeManagedVariable (configPath, name, value) {
  ensureFileExists(configPath)
  let content = fs.readFileSync(configPath, 'utf8')

  const hasBlock = content.includes(BLOCK_START) && content.includes(BLOCK_END)

  if (!hasBlock) {
    const block = [
      '',
      BLOCK_START,
      buildExportLine(configPath, name, value),
      BLOCK_END,
      ''
    ].join('\n')
    content = content.trimEnd() + '\n' + block
    fs.writeFileSync(configPath, content, 'utf8')
    process.env[name] = value
    return
  }

  const lines = content.split('\n')
  const newLines = []
  let inBlock = false
  let replaced = false

  const exportPrefix = configPath.includes('config.fish')
    ? `set -gx ${name} `
    : `export ${name}=`

  for (const line of lines) {
    if (line.trim() === BLOCK_START) {
      inBlock = true
      newLines.push(line)
      continue
    }
    if (line.trim() === BLOCK_END) {
      if (!replaced) {
        newLines.push(buildExportLine(configPath, name, value))
      }
      inBlock = false
      newLines.push(line)
      continue
    }
    if (inBlock && line.trimStart().startsWith(exportPrefix)) {
      newLines.push(buildExportLine(configPath, name, value))
      replaced = true
      continue
    }
    newLines.push(line)
  }

  fs.writeFileSync(configPath, newLines.join('\n'), 'utf8')
  process.env[name] = value
}

/**
 * 从标记块中移除一个变量。
 */
function removeManagedVariable (configPath, name) {
  ensureFileExists(configPath)
  let content = fs.readFileSync(configPath, 'utf8')
  if (!content.includes(BLOCK_START)) return

  const lines = content.split('\n')
  const newLines = []
  let inBlock = false

  const exportPrefix = configPath.includes('config.fish')
    ? `set -gx ${name} `
    : `export ${name}=`

  for (const line of lines) {
    if (line.trim() === BLOCK_START) { inBlock = true; newLines.push(line); continue }
    if (line.trim() === BLOCK_END) { inBlock = false; newLines.push(line); continue }
    if (inBlock && line.trimStart().startsWith(exportPrefix)) continue
    newLines.push(line)
  }

  fs.writeFileSync(configPath, newLines.join('\n'), 'utf8')
  delete process.env[name]
}

/**
 * 解析 /etc/environment（Linux 系统级，KEY=VALUE 或 KEY="VALUE" 格式）。
 * 返回 [{ name, value, type: 'STRING' }]
 */
function parseEtcEnvironment () {
  if (!fs.existsSync(ETC_ENVIRONMENT)) return []

  const content = fs.readFileSync(ETC_ENVIRONMENT, 'utf8')
  const variables = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx <= 0) continue
    const name = trimmed.substring(0, eqIdx).trim()
    let value = trimmed.substring(eqIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    variables.push({ name, value, type: 'STRING' })
  }

  return variables
}

/**
 * 写入 /etc/environment（需要 root 权限）。
 * 使用提权命令（pkexec 或 osascript）写入。
 */
async function writeEtcEnvironment (name, value) {
  if (!fs.existsSync(ETC_ENVIRONMENT)) {
    throw new Error('/etc/environment 文件不存在')
  }

  const content = fs.readFileSync(ETC_ENVIRONMENT, 'utf8')
  const lines = content.split('\n')
  const newLines = []
  let found = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const varName = trimmed.substring(0, eqIdx).trim()
        if (varName === name) {
          newLines.push(`${name}="${value}"`)
          found = true
          continue
        }
      }
    }
    newLines.push(line)
  }

  if (!found) {
    newLines.push(`${name}="${value}"`)
  }

  const newContent = newLines.join('\n')
  await writeFileAsRoot(ETC_ENVIRONMENT, newContent)
  process.env[name] = value
}

/**
 * 从 /etc/environment 移除一个变量（需要 root 权限）。
 */
async function removeFromEtcEnvironment (name) {
  if (!fs.existsSync(ETC_ENVIRONMENT)) return

  const content = fs.readFileSync(ETC_ENVIRONMENT, 'utf8')
  const lines = content.split('\n')
  const newLines = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const varName = trimmed.substring(0, eqIdx).trim()
        if (varName === name) continue
      }
    }
    newLines.push(line)
  }

  const newContent = newLines.join('\n')
  await writeFileAsRoot(ETC_ENVIRONMENT, newContent)
  delete process.env[name]
}

/**
 * 以 root 权限写入文件。macOS 使用 osascript，Linux 使用 pkexec。
 * 注意：darwin 分支目前不会被执行，因为 macOS 系统变量通过
 * launchctl setenv/unsetenv 操作，不涉及 /etc/environment 文件写入。
 * 保留此分支作为兼容预留，以备将来可能需要写入系统文件的场景。
 */
async function writeFileAsRoot (filePath, content) {
  const tmpFile = path.join(os.tmpdir(), `utools-env-${Date.now()}.tmp`)
  fs.writeFileSync(tmpFile, content, 'utf8')

  try {
    if (process.platform === 'darwin') {
      const escaped = `cp "${tmpFile}" "${filePath}"`.replace(/"/g, '\\"')
      const cmd = `osascript -e 'do shell script "${escaped}" with administrator privileges'`
      await execAsync(cmd)
    } else {
      await execAsync(`pkexec cp "${tmpFile}" "${filePath}"`)
    }
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }
}

module.exports = {
  detectShellConfigPath,
  readManagedVariables,
  writeManagedVariable,
  removeManagedVariable,
  parseEtcEnvironment,
  writeEtcEnvironment,
  removeFromEtcEnvironment,
  ETC_ENVIRONMENT
}
