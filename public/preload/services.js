const { spawn, exec } = require('node:child_process')
const { promisify } = require('node:util')
const execAsync = promisify(exec)

// 通过 window 对象向渲染进程注入 nodejs 能力
window.services = {
  // 获取所有环境变量（只读取，不修改）
  getEnvironmentVariables (isSystemScope = false) {
    return new Promise(async (resolve, reject) => {
      try {
        if (process.platform === 'win32') {
          // Windows 系统获取环境变量
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
              // 使用更精确的正则表达式解析注册表输出
              const match = trimmed.match(/^(\S+)\s+(REG_\w+)\s+(.*)$/)
              if (match) {
                const [, name, type, value] = match
                if (name && type.startsWith('REG_')) {
                  variables.push({
                    name,
                    value: value || '',
                    type
                  })
                }
              }
            }
          }
          
          resolve(variables)
        } else {
          // Unix/Linux 系统获取环境变量
          const variables = Object.entries(process.env).map(([name, value]) => ({
            name,
            value: value || '',
            type: 'STRING'
          }))
          resolve(variables)
        }
      } catch (error) {
        console.error('获取环境变量失败:', error)
        reject(new Error(`获取环境变量失败: ${error.message}`))
      }
    })
  },

  // 获取所有环境变量并转换为对象格式（只读取，不修改）
  getAllEnvironmentVariables (isSystemScope = false) {
    return new Promise(async (resolve, reject) => {
      try {
        const variables = await this.getEnvironmentVariables(isSystemScope)
        const result = {}
        
        variables.forEach(variable => {
          result[variable.name] = variable.value
        })
        
        resolve(result)
      } catch (error) {
        console.error('获取所有环境变量失败:', error)
        reject(error)
      }
    })
  },

  // 设置环境变量（支持用户和系统级别）
  setEnvironmentVariable (name, value, isSystemScope = false) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!name || name.trim() === '') {
          reject(new Error('变量名不能为空'))
          return
        }

        if (process.platform === 'win32') {
          if (isSystemScope) {
            // Windows 系统级环境变量设置（需要管理员权限）
            const regPath = 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
            const command = `reg add "${regPath}" /v "${name}" /t REG_SZ /d "${value}" /f`

            try {
              await execAsync(command)
              resolve(`系统环境变量 ${name} 设置成功`)
            } catch (error) {
              // 如果失败，可能是权限问题
              if (error.message.includes('访问被拒绝') || error.message.includes('Access is denied')) {
                reject(new Error(`设置系统环境变量需要管理员权限。请以管理员身份运行 uTools。`))
              } else {
                reject(error)
              }
            }
          } else {
            // Windows 用户级环境变量设置
            const command = `setx "${name}" "${value}"`
            await execAsync(command)
            resolve(`用户环境变量 ${name} 设置成功`)
          }
        } else {
          // Unix/Linux 系统设置环境变量
          process.env[name] = value
          resolve(`环境变量 ${name} 设置成功`)
        }
      } catch (error) {
        console.error(`设置环境变量 ${name} 失败:`, error)
        reject(new Error(`设置环境变量失败: ${error.message}`))
      }
    })
  },

  // 删除环境变量（支持用户和系统级别）
  removeEnvironmentVariable (name, isSystemScope = false) {
    return new Promise(async (resolve, reject) => {
      try {
        if (process.platform === 'win32') {
          if (isSystemScope) {
            // Windows 系统级环境变量删除（需要管理员权限）
            const regPath = 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
            const command = `reg delete "${regPath}" /v "${name}" /f`

            try {
              await execAsync(command)
              resolve(`系统环境变量 ${name} 删除成功`)
            } catch (error) {
              if (error.message.includes('访问被拒绝') || error.message.includes('Access is denied')) {
                reject(new Error(`删除系统环境变量需要管理员权限。请以管理员身份运行 uTools。`))
              } else {
                reject(error)
              }
            }
          } else {
            // Windows 用户级环境变量删除
            const regPath = 'HKEY_CURRENT_USER\\Environment'
            const command = `reg delete "${regPath}" /v "${name}" /f`
            await execAsync(command)
            resolve(`用户环境变量 ${name} 删除成功`)
          }
        } else {
          // Unix/Linux 系统删除环境变量
          delete process.env[name]
          resolve(`环境变量 ${name} 删除成功`)
        }
      } catch (error) {
        console.error(`删除环境变量 ${name} 失败:`, error)
        reject(new Error(`删除环境变量失败: ${error.message}`))
      }
    })
  },

  // 获取单个环境变量
  getEnvironmentVariable (name) {
    return process.env[name] || null
  },

  // 刷新环境变量（通知系统环境变量已更改）
  refreshEnvironment () {
    return new Promise(async (resolve, reject) => {
      try {
        if (process.platform === 'win32') {
          // 通知Windows系统环境变量已更改
          const command = 'rundll32.exe user32.dll,UpdatePerUserSystemParameters'
          await execAsync(command)
          resolve('环境变量刷新成功')
        } else {
          resolve('环境变量刷新成功')
        }
      } catch (error) {
        console.error('刷新环境变量失败:', error)
        reject(new Error(`刷新环境变量失败: ${error.message}`))
      }
    })
  }
}
