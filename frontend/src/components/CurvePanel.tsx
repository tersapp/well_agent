import React, { useRef, useState, useEffect } from 'react';
import { LineChartOutlined, UploadOutlined, LoadingOutlined, SaveOutlined, FolderOpenOutlined } from '@ant-design/icons';
import LogChart, { LogChartRef } from './LogChart';

interface LogData {
    metadata: {
        well: {
            name: string;
            strt: number;
            stop: number;
        };
    };
    curves: Record<string, (number | null)[]>;
}

interface CurvePanelProps {
    logData: LogData | null;
    isLoading: boolean;
    onLoadFile: (file: File) => void;
    onRestoreSession?: (data: LogData) => void;
    highlightRange?: { start: number; end: number };
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
}

const CurvePanel: React.FC<CurvePanelProps> = ({
    logData,
    isLoading,
    onLoadFile,
    onRestoreSession,
    highlightRange,
    isFullscreen = false,
    onToggleFullscreen,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const logChartRef = useRef<LogChartRef>(null);

    // State to handle delayed restoration (wait for logData to update)
    const [pendingSessionState, setPendingSessionState] = useState<any>(null);

    useEffect(() => {
        if (pendingSessionState && logData && logChartRef.current) {
            // Apply view settings after data is loaded
            // Short timeout to ensure LogChart has processed the new data
            setTimeout(() => {
                logChartRef.current?.restoreSessionState(pendingSessionState);
                setPendingSessionState(null);
            }, 100);
        }
    }, [logData, pendingSessionState]);

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onLoadFile(file);
        }
    };

    const handleSaveSession = async () => {
        if (!logData || !logChartRef.current) return;
        const state = logChartRef.current.getSessionState();

        const sessionData = {
            version: '1.0',
            timestamp: new Date().toISOString(),
            logData,
            viewState: state
        };

        // Electron Environment Check
        // @ts-ignore
        if (window.electronAPI) {
            try {
                // @ts-ignore
                const result = await window.electronAPI.saveSession(sessionData);
                if (result.success) {
                    alert(`会话已保存:\n${result.filePath}`);
                } else if (result.error) {
                    alert(`保存失败: ${result.error}`);
                }
            } catch (e: any) {
                console.error('Save failed', e);
                alert(`保存异常: ${e.message}`);
            }
        }
        // Browser Fallback
        else {
            try {
                const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `session_${logData.metadata.well.name || 'well'}_${new Date().getTime()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (e: any) {
                console.error('Browser save failed', e);
                alert('浏览器保存失败');
            }
        }
    };

    const handleLoadSession = async () => {
        // Electron Environment Check
        // @ts-ignore
        if (window.electronAPI) {
            try {
                // @ts-ignore
                const result = await window.electronAPI.loadSession();
                if (result && result.success && result.data) {
                    const { logData: savedLogData, viewState } = result.data;
                    if (savedLogData && onRestoreSession) {
                        onRestoreSession(savedLogData);
                        setPendingSessionState(viewState);
                    }
                } else if (result && result.error) {
                    alert(`加载失败: ${result.error}`);
                }
            } catch (e: any) {
                console.error('Load failed', e);
                alert(`加载异常: ${e.message}`);
            }
        }
        // Browser Fallback
        else {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e: any) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const content = event.target?.result as string;
                        const parsed = JSON.parse(content);
                        if (parsed && parsed.logData) {
                            if (onRestoreSession) {
                                onRestoreSession(parsed.logData);
                                setPendingSessionState(parsed.viewState);
                            }
                        } else {
                            alert('无效的会话文件格式');
                        }
                    } catch (err) {
                        alert('文件解析失败');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }
    };

    const curveCount = logData ? Object.keys(logData.curves).length : 0;
    const depth = logData?.curves['DEPTH'] || logData?.curves['DEPT'] || [];

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: isFullscreen ? 0 : 'var(--spacing-md)',
            gap: 'var(--spacing-md)',
            height: '100%',
        }}>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".las,.LAS"
                onChange={handleFileChange}
            />

            {/* Header - Hidden in fullscreen */}
            {!isFullscreen && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{
                        fontSize: '1.1rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)'
                    }}>
                        <LineChartOutlined />
                        测井曲线
                    </h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            className="btn btn-ghost"
                            onClick={handleLoadSession}
                            title="加载会话 (恢复保存的视图)"
                            disabled={isLoading}
                        >
                            <FolderOpenOutlined />
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={handleSaveSession}
                            title="保存当前会话 (数据与视图配置)"
                            disabled={!logData || isLoading}
                        >
                            <SaveOutlined />
                        </button>
                        <div style={{ width: 1, backgroundColor: '#3f3f46', margin: '0 4px' }} />
                        <button
                            className="btn btn-ghost"
                            onClick={handleButtonClick}
                            disabled={isLoading}
                        >
                            {isLoading ? <LoadingOutlined spin /> : <UploadOutlined />}
                            {isLoading ? '加载中...' : '加载数据'}
                        </button>
                    </div>
                </div>
            )}

            {/* Curve Display Area */}
            <div
                style={{
                    flex: 1,
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 12,
                }}
            >
                {isLoading ? (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        color: 'var(--text-muted)'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <LoadingOutlined style={{ fontSize: 48, marginBottom: 16, color: 'var(--accent-primary)' }} spin />
                            <div>正在解析 LAS 文件...</div>
                        </div>
                    </div>
                ) : logData && depth.length > 0 ? (
                    <LogChart
                        ref={logChartRef}
                        depth={depth as number[]}
                        curves={logData.curves}
                        highlightRange={highlightRange}
                        isFullscreen={isFullscreen}
                        onToggleFullscreen={onToggleFullscreen}
                    />
                ) : (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <LineChartOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
                            <div>暂无数据</div>
                            <div style={{ fontSize: '0.85rem', marginTop: 8 }}>
                                点击"加载数据"或"打开会话"
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Info Bar - Hidden in fullscreen */}
            {!isFullscreen && (
                <div style={{
                    display: 'flex',
                    gap: 'var(--spacing-lg)',
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    background: 'var(--bg-card)',
                    borderRadius: 8,
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)'
                }}>
                    <span>井号: <strong style={{ color: 'var(--text-primary)' }}>
                        {logData?.metadata.well.name || '--'}
                    </strong></span>
                    <span>深度范围: <strong style={{ color: 'var(--text-primary)' }}>
                        {logData ? `${logData.metadata.well.strt} - ${logData.metadata.well.stop} m` : '--'}
                    </strong></span>
                    <span>曲线数: <strong style={{ color: 'var(--text-primary)' }}>
                        {curveCount || '--'}
                    </strong></span>
                </div>
            )}
        </div>
    );
};

export default CurvePanel;
