import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../utils/cn'

export default function CustomSelect({
  value,
  onChange,
  options = [],
  placeholder = '请选择...',
  className,
  triggerClassName,
  size = 'md',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef(null)

  const selectedOption = options.find(o => String(o.value) === String(value))
  const displayLabel = selectedOption?.label || placeholder

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownHeight = Math.min(options.length * 36 + 8, 240)
    const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight

    setDropdownPos({
      top: showAbove ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [options.length])

  const toggle = () => {
    if (!isOpen) updatePosition()
    setIsOpen(prev => !prev)
  }

  const handleSelect = (optValue) => {
    onChange(optValue)
    setIsOpen(false)
  }

  useEffect(() => {
    if (!isOpen) return
    const onScroll = () => updatePosition()
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [isOpen, updatePosition])

  const sizeClasses = size === 'sm'
    ? 'h-8 px-2.5 text-sm gap-1'
    : 'h-10 px-4 text-sm gap-2'

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={cn(
          'flex items-center justify-between rounded-lg border transition-colors',
          'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600',
          'text-slate-900 dark:text-slate-100',
          'hover:border-slate-300 dark:hover:border-slate-500',
          'focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-slate-400/20 focus:border-slate-300 dark:focus:border-slate-500',
          sizeClasses,
          !selectedOption && 'text-slate-400 dark:text-slate-500',
          className,
          triggerClassName,
        )}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={cn('w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setIsOpen(false)} />
          <div
            className="fixed z-[80] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 overflow-y-auto"
            style={{ top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, maxHeight: 240 }}
          >
            {options.map((opt) => {
              const isSelected = String(opt.value) === String(value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                    'hover:bg-slate-50 dark:hover:bg-slate-700/70',
                    isSelected
                      ? 'text-slate-900 dark:text-slate-100 font-medium'
                      : 'text-slate-600 dark:text-slate-400',
                  )}
                >
                  <span className="flex-1 truncate">{opt.label}</span>
                  {isSelected && <Check className="w-4 h-4 shrink-0 text-slate-900 dark:text-slate-100" />}
                </button>
              )
            })}
            {options.length === 0 && (
              <div className="px-3 py-4 text-sm text-slate-400 dark:text-slate-500 text-center">暂无选项</div>
            )}
          </div>
        </>
      )}
    </>
  )
}
