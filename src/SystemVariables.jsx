import { useState, useEffect } from 'react';
import { Copy, AlertCircle, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from './utils/cn';

export default function SystemVariables() {
  const [systemVariables, setSystemVariables] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedVars, setExpandedVars] = useState(new Set());
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  useEffect(() => {
    loadSystemVariables();
  }, []);

  const loadSystemVariables = async () => {
    setIsLoading(true);
    try {
      if (window.services && window.services.getAllEnvironmentVariables) {
        const vars = await window.services.getAllEnvironmentVariables(true);
        const varArray = Object.entries(vars).map(([name, value]) => ({ name, value: value || '' }));
        setSystemVariables(varArray.sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const mockVars = [
          { name: 'PATH', value: 'C:\\Windows\\System32;C:\\Program Files' },
          { name: 'ComSpec', value: 'C:\\Windows\\System32\\cmd.exe' },
          { name: 'OS', value: 'Windows_NT' },
          { name: 'SystemRoot', value: 'C:\\Windows' },
        ];
        setSystemVariables(mockVars);
      }
    } catch (error) {
      showToast('加载失败: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  const copyToClipboard = async (text) => {
    try {
      if (window.utools && window.utools.copyText) {
        window.utools.copyText(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      showToast('已复制', 'success');
    } catch (error) {
      showToast('复制失败', 'error');
    }
  };

  const toggleExpanded = (varName) => {
    setExpandedVars(prev => {
      const newSet = new Set(prev);
      if (newSet.has(varName)) {
        newSet.delete(varName);
      } else {
        newSet.add(varName);
      }
      return newSet;
    });
  };

  const isPathVariable = (name) => {
    return name.toUpperCase() === 'PATH';
  };

  const splitPathValue = (value) => {
    if (!value || typeof value !== 'string') return [];
    const separator = value.includes(';') ? ';' : ':';
    return value.split(separator).filter(p => p && p.trim());
  };

  const filteredVars = systemVariables.filter(v => {
    if (!v || !v.name || v.value == null) return false;
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return v.name.toLowerCase().includes(query) || String(v.value).toLowerCase().includes(query);
  });

  return (
    <div className="p-6 pb-20">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">系统环境变量</h1>
        <p className="text-sm text-slate-500">
          Windows 系统级环境变量 · {filteredVars.length} 个 · 只读
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索变量名或值..."
          className={cn(
            "w-full h-10 px-4 text-sm",
            "bg-white border border-slate-200 rounded-lg",
            "text-slate-900 placeholder:text-slate-400",
            "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-300"
          )}
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-slate-400 animate-spin mb-4" />
          <p className="text-sm text-slate-500">加载中...</p>
        </div>
      )}

      {/* Variables List */}
      {!isLoading && filteredVars.length > 0 && (
        <div className="space-y-3">
          {filteredVars.map((variable) => {
            const isExpanded = expandedVars.has(variable.name);
            const isPath = isPathVariable(variable.name);
            const isLongValue = !isPath && variable.value.length > 100;

            return (
              <div
                key={variable.name}
                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <h3 className="font-mono text-sm font-medium text-slate-900">{variable.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-block px-2 py-0.5 text-xs text-slate-500 bg-slate-100 rounded">
                        只读
                      </span>
                      {isPath && (
                        <span className="inline-block px-2 py-0.5 text-xs text-blue-600 bg-blue-50 rounded">
                          PATH 变量
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyToClipboard(variable.value)}
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        "text-slate-600 hover:bg-slate-100 transition-colors"
                      )}
                      title="复制"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {(isPath || isLongValue) && (
                      <button
                        onClick={() => toggleExpanded(variable.name)}
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          "text-slate-600 hover:bg-slate-100 transition-colors"
                        )}
                        title={isExpanded ? '收起' : '展开'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  {isPath ? (
                    // PATH 变量：显示路径列表
                    <div className="space-y-1">
                      {isExpanded ? (
                        splitPathValue(variable.value).map((path, idx) => (
                          <div key={idx} className="font-mono text-xs text-slate-700 bg-white px-3 py-2 rounded border border-slate-200">
                            {path}
                          </div>
                        ))
                      ) : (
                        <>
                          {splitPathValue(variable.value).slice(0, 3).map((path, idx) => (
                            <div key={idx} className="font-mono text-xs text-slate-700 bg-white px-3 py-2 rounded border border-slate-200">
                              {path}
                            </div>
                          ))}
                          {splitPathValue(variable.value).length > 3 && (
                            <div className="text-xs text-slate-500 text-center pt-2">
                              还有 {splitPathValue(variable.value).length - 3} 个路径...
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    // 普通变量
                    <div className="font-mono text-xs text-slate-700 break-all">
                      {isExpanded || !isLongValue ? variable.value : variable.value.substring(0, 100) + '...'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredVars.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white border border-slate-200 rounded-xl">
          <p className="text-slate-600">
            {searchQuery ? '未找到匹配的变量' : '暂无系统变量'}
          </p>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg",
              toast.type === 'success' && "bg-white border border-slate-200 text-slate-900",
              toast.type === 'error' && "bg-red-50 border border-red-200 text-red-900"
            )}
          >
            {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-600" />}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
