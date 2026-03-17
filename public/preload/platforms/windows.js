const { exec } = require('node:child_process')
const { promisify } = require('node:util')
const execAsync = promisify(exec)

const SETX_VALUE_LIMIT = 1024

module.exports = {
  async getEnvironmentVariables (isSystemScope = false) {
    const regPath = isSystemScope
      ? 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
      : 'HKEY_CURRENT_USER\\Environment'

    const command = `reg query "${regPath}"`
    const { stdout } = await execAsync(command, { encoding: 'utf8' })

    const variables = []
    const lines = stdout.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.includes('HKEY_') && trimmed.includes('REG_')) {
        const match = trimmed.match(/^(\S+)\s+(REG_\w+)\s+(.*)$/)
        if (match) {
          const [, name, type, value] = match
          if (name && type.startsWith('REG_')) {
            variables.push({ name, value: value || '', type })
          }
        }
      }
    }

    return variables
  },

  async getAllEnvironmentVariables (isSystemScope = false) {
    const variables = await this.getEnvironmentVariables(isSystemScope)
    const result = {}
    variables.forEach(v => { result[v.name] = v.value })
    return result
  },

  async canModifySystemEnvironment () {
    try {
      const command = 'powershell -NoProfile -NonInteractive -Command "[bool](([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))"'
      const { stdout } = await execAsync(command, { encoding: 'utf8' })
      return String(stdout).trim().toLowerCase() === 'true'
    } catch {
      return false
    }
  },

  async setEnvironmentVariable (name, value, isSystemScope = false) {
    if (!name || name.trim() === '') {
      throw new Error('变量名不能为空')
    }

    if (isSystemScope) {
      const regPath = 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
      const regType = name.toUpperCase() === 'PATH' ? 'REG_EXPAND_SZ' : 'REG_SZ'
      const command = `reg add "${regPath}" /v "${name}" /t ${regType} /d "${value}" /f`
      try {
        await execAsync(command)
        return `系统环境变量 ${name} 设置成功`
      } catch (error) {
        if (error.message.includes('访问被拒绝') || error.message.includes('Access is denied')) {
          throw new Error('设置系统环境变量需要管理员权限。请以管理员身份运行 uTools。')
        }
        throw error
      }
    }

    if (value.length > SETX_VALUE_LIMIT) {
      const regPath = 'HKEY_CURRENT_USER\\Environment'
      const regType = name.toUpperCase() === 'PATH' ? 'REG_EXPAND_SZ' : 'REG_SZ'
      const command = `reg add "${regPath}" /v "${name}" /t ${regType} /d "${value}" /f`
      await execAsync(command)
      return `用户环境变量 ${name} 设置成功（值超过 ${SETX_VALUE_LIMIT} 字符，已使用注册表直接写入）`
    }

    const command = `setx "${name}" "${value}"`
    await execAsync(command)
    return `用户环境变量 ${name} 设置成功`
  },

  async removeEnvironmentVariable (name, isSystemScope = false) {
    if (isSystemScope) {
      const regPath = 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
      const command = `reg delete "${regPath}" /v "${name}" /f`
      try {
        await execAsync(command)
        return `系统环境变量 ${name} 删除成功`
      } catch (error) {
        if (error.message.includes('访问被拒绝') || error.message.includes('Access is denied')) {
          throw new Error('删除系统环境变量需要管理员权限。请以管理员身份运行 uTools。')
        }
        throw error
      }
    }

    const regPath = 'HKEY_CURRENT_USER\\Environment'
    const command = `reg delete "${regPath}" /v "${name}" /f`
    await execAsync(command)
    return `用户环境变量 ${name} 删除成功`
  },

  getEnvironmentVariable (name) {
    return process.env[name] || null
  },

  async refreshEnvironment () {
    const command = 'rundll32.exe user32.dll,UpdatePerUserSystemParameters'
    await execAsync(command)
    return '环境变量刷新成功'
  },

  getShellConfigInfo () {
    return null
  },

  getValueLengthLimit () {
    return SETX_VALUE_LIMIT
  },

  openSystemEnvSettings () {
    exec('rundll32 sysdm.cpl,EditEnvironmentVariables')
  }
}
