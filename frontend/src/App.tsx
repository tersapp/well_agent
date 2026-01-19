import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import CurvePanel from './components/CurvePanel';
import ChatPanel from './components/ChatPanel';
import HistoryPage from './components/HistoryPage';
import AnalysisConfigModal, { AnalysisConfig } from './components/AnalysisConfigModal';
import CurveMappingModal from './components/CurveMappingModal';
import api from './api/client';

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

interface Message {
    id: string;
    agent: string;
    content: string;
    confidence: number;
    timestamp: Date;
    isFinal?: boolean;
}

const App: React.FC = () => {
    const [activeView, setActiveView] = useState<'analysis' | 'report' | 'history' | 'generation' | 'logs'>('analysis');
    const [logData, setLogData] = useState<LogData | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [progressStatus, setProgressStatus] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [chatPanelCollapsed, setChatPanelCollapsed] = useState(false);

    // Curve mapping state
    const [showMappingModal, setShowMappingModal] = useState(false);
    const [curveMapping, setCurveMapping] = useState<any>(null);
    const [standardTypes, setStandardTypes] = useState<Record<string, any>>({});
    const [llmSuggestions, setLlmSuggestions] = useState<Record<string, string | null>>({});
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

    const handleLoadFile = async (file: File) => {
        setIsLoading(true);

        try {
            const result = await api.parseLasFile(file);

            if (result.success) {
                setLogData(result.data);
                setSessionId(result.session_id);

                const qcStatus = result.qc_report.pass ? '✓ 质控通过' : '⚠ 质控有问题';
                const curveCount = Object.keys(result.data.curves).length;

                setMessages([{
                    id: Date.now().toString(),
                    agent: 'System',
                    content: `已成功加载: ${file.name}\n深度范围: ${result.data.metadata.well.strt} - ${result.data.metadata.well.stop} m\n曲线数量: ${curveCount}\n${qcStatus}`,
                    confidence: 1.0,
                    timestamp: new Date(),
                }]);

                if (result.qc_report.warnings.length > 0) {
                    setMessages(prev => [...prev, {
                        id: (Date.now() + 1).toString(),
                        agent: 'System',
                        content: `质控警告: ${result.qc_report.warnings.join(', ')}`,
                        confidence: 0.8,
                        timestamp: new Date(),
                    }]);
                }

                // Check curve mapping
                const mapping = result.curve_mapping;
                if (mapping && mapping.unmatched && mapping.unmatched.length > 0) {
                    setCurveMapping(mapping);

                    // Load standard types
                    try {
                        const typesResult = await api.getCurveStandardTypes();
                        if (typesResult.success) {
                            setStandardTypes(typesResult.standard_types);
                        }
                    } catch (e) {
                        console.error('Failed to load standard types:', e);
                    }

                    // Get LLM suggestions
                    setIsLoadingSuggestions(true);
                    setShowMappingModal(true);

                    try {
                        const suggestResult = await api.suggestCurveMapping(result.session_id);
                        if (suggestResult.success) {
                            setLlmSuggestions(suggestResult.suggestions);
                        }
                    } catch (e) {
                        console.error('Failed to get LLM suggestions:', e);
                    } finally {
                        setIsLoadingSuggestions(false);
                    }
                }
            }
        } catch (error: any) {
            console.error('Failed to load file:', error);
            setMessages([{
                id: Date.now().toString(),
                agent: 'System',
                content: `文件加载失败: ${error.message || '请检查后端服务是否运行'}`,
                confidence: 0,
                timestamp: new Date(),
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRestoreSession = (data: LogData) => {
        setLogData(data);
        // Generate a session ID from the well name for restored sessions
        const generatedSessionId = `restored_${data.metadata.well.name || 'unknown'}_${Date.now()}`;
        setSessionId(generatedSessionId);

        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            agent: 'System',
            content: `会话已从文件恢复: ${data.metadata.well.name}\n注意: 需要重新上传 LAS 文件以启用 AI 分析`,
            confidence: 1.0,
            timestamp: new Date(),
        }]);
    };

    const handleMappingConfirm = async (mappings: Record<string, string>, shouldSave: boolean) => {
        if (shouldSave) {
            try {
                const result = await api.saveCurveMapping(mappings);
                if (result.success) {
                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        agent: 'System',
                        content: `已保存 ${result.saved.length} 条曲线映射，下次将自动识别。`,
                        confidence: 1.0,
                        timestamp: new Date(),
                    }]);
                }
            } catch (error) {
                console.error('Failed to save mappings:', error);
            }
        }

        setShowMappingModal(false);
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            agent: 'System',
            content: `曲线映射已应用，可以开始分析。`,
            confidence: 1.0,
            timestamp: new Date(),
        }]);
    };

    const handleRequestAnalysis = () => {
        setShowConfigModal(true);
    };

    const handleStartAnalysis = async (config: AnalysisConfig) => {
        setShowConfigModal(false);
        if (!logData) return;

        setIsAnalyzing(true);
        setProgressStatus('正在启动智能体系统...');

        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            agent: 'System',
            content: `分析配置: 深度 ${config.startDepth}-${config.endDepth}m${config.focusNote ? `, 重点: ${config.focusNote}` : ''}`,
            confidence: 1.0,
            timestamp: new Date(),
        }]);

        // Use streaming analysis
        console.log('Starting streaming analysis with sessionId:', sessionId);

        const agentNames: Record<string, string> = {
            LithologyExpert: '岩性专家',
            ElectricalExpert: '电性专家',
            ReservoirPropertyExpert: '物性专家',
            SaturationExpert: '饱和度专家',
            MudLoggingExpert: '气测专家',
            MineralogyExpert: '矿物专家',
            Arbitrator: '仲裁者',
        };

        api.createStreamingAnalysis(
            config.startDepth,
            config.endDepth,
            config.focusNote,
            sessionId,
            // onMessage callback - called for each SSE event
            (data) => {
                if (data.type === 'agent_message') {
                    const displayName = agentNames[data.agent || ''] || data.agent;
                    setProgressStatus(`${displayName}正在分析...`);

                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        agent: data.agent || 'Unknown',
                        content: data.content || '',
                        confidence: data.confidence || 0,
                        timestamp: new Date(),
                        isFinal: data.is_final,
                    }]);

                    // Brief completion status
                    setTimeout(() => {
                        setProgressStatus(`${displayName}分析完成`);
                    }, 100);
                } else if (data.type === 'final_decision') {
                    console.log('Final decision received:', data);
                } else if (data.type === 'error') {
                    console.error('Stream error:', data.message);
                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        agent: 'System',
                        content: `流式分析错误: ${data.message}`,
                        confidence: 0,
                        timestamp: new Date(),
                    }]);
                }
            },
            // onError callback
            (error) => {
                console.error('Streaming analysis failed:', error);
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    agent: 'System',
                    content: `分析失败: ${error instanceof Error ? error.message : '请检查后端服务'}`,
                    confidence: 0,
                    timestamp: new Date(),
                }]);
                setIsAnalyzing(false);
                setProgressStatus('');
            },
            // onComplete callback
            () => {
                console.log('Streaming analysis completed');
                setIsAnalyzing(false);
                setProgressStatus('');
            }
        );
    };

    const depthRange = logData
        ? { min: logData.metadata.well.strt, max: logData.metadata.well.stop }
        : { min: 0, max: 0 };

    return (
        <div className="app-container">
            {/* Sidebar - Hidden in fullscreen */}
            {!isFullscreen && (
                <Sidebar
                    activeView={activeView}
                    onViewChange={(view: any) => setActiveView(view)}
                    messages={messages}
                    progressStatus={progressStatus}
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                />
            )}

            <main className="main-content" style={{ flex: 1 }}>
                {activeView === 'history' ? (
                    <HistoryPage onNavigateBack={() => setActiveView('analysis')} />
                ) : activeView === 'generation' ? (
                    <div className="placeholder-view" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                        <h2>智能生成</h2>
                        <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>新功能开发中，敬请期待...</p>
                    </div>
                ) : activeView === 'logs' ? (
                    <div className="placeholder-view" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                        <h2>操作日志</h2>
                        <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>日志记录系统初始化中...</p>
                    </div>
                ) : activeView === 'report' ? (
                    <div className="placeholder-view" style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}>
                        <h2>报告生成</h2>
                        <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>自动化报告生成模块开发中...</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
                        {/* Curve Panel - Constrained width */}
                        <div style={{
                            flex: 1,
                            minWidth: 400,
                            maxWidth: isFullscreen ? '100%' : `calc(100% - ${chatPanelCollapsed ? '40px' : '420px'})`,
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100%',
                            overflow: 'hidden',
                            transition: 'max-width 0.3s ease'
                        }}>
                            <CurvePanel
                                logData={logData}
                                isLoading={isLoading}
                                onLoadFile={handleLoadFile}
                                onRestoreSession={handleRestoreSession}
                                isFullscreen={isFullscreen}
                                onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
                                onAnalysisRequest={(start, end, note) => {
                                    setActiveView('analysis');
                                    setChatPanelCollapsed(false);
                                    handleStartAnalysis({
                                        startDepth: start,
                                        endDepth: end,
                                        focusNote: note,
                                    });
                                }}
                            />
                        </div>

                        {/* Chat Panel - Hidden in fullscreen */}
                        {!isFullscreen && (
                            <div style={{
                                width: chatPanelCollapsed ? 40 : 420,
                                borderLeft: '1px solid var(--border-color)',
                                transition: 'width 0.3s ease',
                                overflow: 'hidden',
                                position: 'relative'
                            }}>
                                <ChatPanel
                                    messages={messages}
                                    isAnalyzing={isAnalyzing}
                                    progressStatus={progressStatus}
                                    onStartAnalysis={handleRequestAnalysis}
                                    canAnalyze={!!logData && !isAnalyzing}
                                    collapsed={chatPanelCollapsed}
                                    onToggleCollapse={() => setChatPanelCollapsed(!chatPanelCollapsed)}
                                />
                            </div>
                        )}
                    </div>
                )}
            </main>

            <AnalysisConfigModal
                visible={showConfigModal}
                onClose={() => setShowConfigModal(false)}
                onConfirm={handleStartAnalysis}
                depthRange={depthRange}
            />

            <CurveMappingModal
                visible={showMappingModal}
                onClose={() => setShowMappingModal(false)}
                onConfirm={handleMappingConfirm}
                curveMapping={curveMapping}
                standardTypes={standardTypes}
                llmSuggestions={llmSuggestions}
                isLoadingSuggestions={isLoadingSuggestions}
            />
        </div>
    );
};

export default App;
