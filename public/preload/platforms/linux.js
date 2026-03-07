const {
  detectShellConfigPath,
  readManagedVariables,
  writeManagedVariable,
  removeManagedVariable,
  parseEtcEnvironment,
  writeEtcEnvironment,
  removeFromEtcEnvironment
} = require('./shellProfile')

module.exports = {
  async getEnvironmentVariables (isSystemScope = false) {
    if (isSystemScope) {
      const etcVars = parseEtcEnvironment()
      if (etcVars.length > 0) return etcVars

      return Object.entries(process.env).map(([name, value]) => ({
        name,
        value: value || '',
        type: 'STRING'
      }))
    }

    const allVars = Object.entries(process.env).map(([name, value]) => ({
      name,
      value: value || '',
      type: 'STRING'
    }))

    const configPath = detectShellConfigPath()
    const managed = readManagedVariables(configPath)
    const managedMap = new Map(managed.map(v => [v.name, v.value]))

    return allVars.map(v => ({
      ...v,
      value: managedMap.has(v.name) ? managedMap.get(v.name) : v.value
    }))
  },

  async getAllEnvironmentVariables (isSystemScope = false) {
    const variables = await this.getEnvironmentVariables(isSystemScope)
    const result = {}
    variables.forEach(v => { result[v.name] = v.value })
    return result
  },

  async canModifySystemEnvironment () {
    return true
  },

  async setEnvironmentVariable (name, value, isSystemScope = false) {
    if (!name || name.trim() === '') {
      throw new Error('变量名不能为空')
    }

    if (isSystemScope) {
      try {
        await writeEtcEnvironment(name, value)
        return `系统环境变量 ${name} 设置成功`
      } catch (error) {
        throw new Error(`设置系统环境变量失败: ${error.message}`)
      }
    }

    const configPath = detectShellConfigPath()
    writeManagedVariable(configPath, name, value)
    return `用户环境变量 ${name} 设置成功（重新打开终端后生效）`
  },

  async removeEnvironmentVariable (name, isSystemScope = false) {
    if (isSystemScope) {
      try {
        await removeFromEtcEnvironment(name)
        return `系统环境变量 ${name} 删除成功`
      } catch (error) {
        throw new Error(`删除系统环境变量失败: ${error.message}`)
      }
    }

    const configPath = detectShellConfigPath()
    removeManagedVariable(configPath, name)
    return `用户环境变量 ${name} 删除成功（重新打开终端后生效）`
  },

  getEnvironmentVariable (name) {
    return process.env[name] || null
  },

  async refreshEnvironment () {
    return '环境变量已更新（重新打开终端后完全生效）'
  },

  getShellConfigInfo () {
    const configPath = detectShellConfigPath()
    const managed = readManagedVariables(configPath)
    return { configPath, managedVariables: managed }
  },

  getValueLengthLimit () {
    return null
  }
}
