import { useState, useEffect } from 'react'
import {
    ArrowLeft, Trash2, RotateCcw, X, Clock,
    AlertCircle, CheckCircle, Settings, ChevronDown
} from 'lucide-react'
import { cn } from './utils/cn'
import { useTrashHistory } from './hooks/useTrashHistory'

export default function TrashHistoryPage({ tabType, onBack, onRestore }) {
    const {
        records,
        settings,
        loadRecords,
        deleteFromTrash,
        clearOldRecords,
        updateSettings,
    } = useTrashHistory(tabType)

    const [showSettings, setShowSettings] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [recordToDelete, setRecordToDelete] = useState(null)
    const [toast, setToast] = useState(null)

    const tabLabels = {
        'groups': '自定义变量组',
        'user-vars': '用户变量',
    }

    useEffect(() => {
        loadRecords()
        // Auto cleanup on mount
        const deleted = clearOldRecords()
        if (deleted > 0) {
            showToast(`已自动清理 ${deleted} 条过期记录`, 'info')
        }
    }, [loadRecords, clearOldRecords])

    const showToast = (message, type = 'success') => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3000)
    }

    const handleRestore = async (record) => {
        try {
            if (onRestore) {
                const success = await onRestore(record)
                if (success) {
                    deleteFromTrash(record.id)
                    showToast('还原成功', 'success')
                }
            }
        } catch (error) {
            showToast('还原失败: ' + error.message, 'error')
        }
    }

    const openDeleteModal = (record) => {
        setRecordToDelete(record)
        setShowDeleteModal(true)
    }

    const closeDeleteModal = () => {
        setRecordToDelete(null)
        setShowDeleteModal(false)
    }

    const confirmDelete = () => {
        if (recordToDelete) {
            deleteFromTrash(recordToDelete.id)
            showToast('记录已永久删除', 'success')
            closeDeleteModal()
        }
    }

    const formatTimestamp = (timestamp) => {
        const date = new Date(timestamp)
        const now = new Date()
        const diffMs = now - date
        const diffMins = Math.floor(diffMs / (1000 * 60))
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

        if (diffMins < 1) return '刚刚'
        if (diffMins < 60) return `${diffMins} 分钟前`
        if (diffHours < 24) return `${diffHours} 小时前`
        if (diffDays < 7) return `${diffDays} 天前`

        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const cleanupOptions = [
        { value: 7, label: '1 周' },
        { value: 30, label: '1 个月' },
        { value: 90, label: '3 个月' },
    ]

    return (
        <div className="min-h-screen bg-zinc-50">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-white border-b border-slate-200">
                <div className="max-w-4xl mx-auto px-6">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={onBack}
                                className={cn(
                                    "w-10 h-10 rounded-lg flex items-center justify-center",
                                    "text-slate-600 hover:bg-slate-100 transition-colors"
                                )}
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h1 className="text-lg font-semibold text-slate-900">操作历史</h1>
                                <p className="text-xs text-slate-500">{tabLabels[tabType]} · {records.length} 条记录</p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowSettings(!showSettings)}
                            className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center",
                                "text-slate-600 hover:bg-slate-100 transition-colors",
                                showSettings && "bg-slate-100"
                            )}
                            title="设置"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Settings Panel */}
            {showSettings && (
                <div className="border-b border-slate-200 bg-slate-50">
                    <div className="max-w-4xl mx-auto px-6 py-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-medium text-slate-900">自动清理</h3>
                                <p className="text-xs text-slate-500 mt-0.5">超过设定时间的记录将被自动删除</p>
                            </div>
                            <div className="relative">
                                <select
                                    value={settings.autoCleanupDays}
                                    onChange={(e) => updateSettings({ autoCleanupDays: Number(e.target.value) })}
                                    className={cn(
                                        "h-9 pl-3 pr-8 text-sm appearance-none",
                                        "bg-white border border-slate-200 rounded-lg",
                                        "text-slate-900 cursor-pointer",
                                        "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
                                    )}
                                >
                                    {cleanupOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Content */}
            <div className="max-w-4xl mx-auto p-6">
                {records.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 bg-white border border-slate-200 rounded-xl">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                            <Clock className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="text-slate-600 mb-2">暂无操作记录</p>
                        <p className="text-sm text-slate-500">删除或编辑的内容会显示在这里</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {records.map((record) => (
                            <div
                                key={record.id}
                                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all"
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={cn(
                                            "px-2 py-0.5 text-xs font-medium rounded border",
                                            record.action === 'delete' && "bg-red-50 text-red-600 border-red-200",
                                            record.action === 'edit' && "bg-amber-50 text-amber-600 border-amber-200"
                                        )}>
                                            {record.action === 'delete' ? '删除' : '编辑'}
                                        </span>
                                        <span className="font-mono text-sm font-medium text-slate-900">
                                            {record.name}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                            {formatTimestamp(record.timestamp)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => handleRestore(record)}
                                            className={cn(
                                                "h-8 px-3 rounded-lg flex items-center gap-1.5 text-sm",
                                                "bg-white border border-slate-200 text-slate-700",
                                                "hover:bg-slate-50 transition-colors"
                                            )}
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" />
                                            还原
                                        </button>
                                        <button
                                            onClick={() => openDeleteModal(record)}
                                            className={cn(
                                                "w-8 h-8 rounded-lg flex items-center justify-center",
                                                "text-red-600 hover:bg-red-50 transition-colors"
                                            )}
                                            title="永久删除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Content Preview */}
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                    {record.action === 'edit' && record.originalData ? (
                                        <div className="space-y-2">
                                            <div>
                                                <span className="text-xs text-slate-500">原值:</span>
                                                <div className="font-mono text-xs text-red-600 bg-red-50 px-2 py-1 rounded mt-1 break-all">
                                                    {typeof record.originalData === 'object'
                                                        ? JSON.stringify(record.originalData.value || record.originalData, null, 2)
                                                        : record.originalData}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-xs text-slate-500">新值:</span>
                                                <div className="font-mono text-xs text-green-600 bg-green-50 px-2 py-1 rounded mt-1 break-all">
                                                    {typeof record.data === 'object'
                                                        ? JSON.stringify(record.data.value || record.data, null, 2)
                                                        : record.data}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="font-mono text-xs text-slate-700 break-all">
                                            {typeof record.data === 'object'
                                                ? (record.data.variables
                                                    ? record.data.variables.map(v => `${v.name}=${v.value}`).join('\n')
                                                    : JSON.stringify(record.data.value || record.data, null, 2))
                                                : record.data}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteModal && recordToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
                        <div className="flex items-center justify-between p-6 border-b border-slate-200">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
                                    <AlertCircle className="w-5 h-5" />
                                </div>
                                <h2 className="text-lg font-semibold text-slate-900">永久删除</h2>
                            </div>
                            <button
                                onClick={closeDeleteModal}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6">
                            <p className="text-sm text-slate-700">
                                确定要永久删除这条记录吗？此操作无法撤销。
                            </p>
                            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                                <p className="text-xs text-slate-500 mb-1">{recordToDelete.action === 'delete' ? '已删除' : '已编辑'}:</p>
                                <p className="text-sm font-mono text-slate-700">{recordToDelete.name}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
                            <button
                                onClick={closeDeleteModal}
                                className="h-10 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="h-10 px-4 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                            >
                                永久删除
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                    <div className={cn(
                        "flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg",
                        toast.type === 'success' && "bg-white border border-slate-200 text-slate-900",
                        toast.type === 'error' && "bg-red-50 border border-red-200 text-red-900",
                        toast.type === 'info' && "bg-white border border-slate-200 text-slate-900"
                    )}>
                        {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
                        {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
                        {toast.type === 'info' && <Clock className="w-4 h-4 text-slate-600" />}
                        <span className="text-sm font-medium">{toast.message}</span>
                    </div>
                </div>
            )}
        </div>
    )
}
