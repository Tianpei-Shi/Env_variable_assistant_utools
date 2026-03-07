import { useEffect, useCallback } from 'react'

const THEME_MODES = ['system', 'light', 'dark']

function getSystemPrefersDark () {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function applyThemeClass (mode) {
  const root = document.documentElement
  if (mode === 'dark' || (mode === 'system' && getSystemPrefersDark())) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function useTheme (themeMode = 'system') {
  const safeMode = THEME_MODES.includes(themeMode) ? themeMode : 'system'

  useEffect(() => {
    applyThemeClass(safeMode)

    if (safeMode !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyThemeClass('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [safeMode])

  const setTheme = useCallback((mode) => {
    applyThemeClass(mode)
  }, [])

  return { currentMode: safeMode, setTheme }
}

export { applyThemeClass }
