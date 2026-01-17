import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import CurvePanel from './components/CurvePanel';
import ChatPanel from './components/ChatPanel';
import AnalysisConfigModal, { AnalysisConfig } from './components/AnalysisConfigModal';
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
    const [activeView, setActiveView] = useState<'analysis' | 'report'>('analysis');
    const [logData, setLogData] = useState<LogData | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

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
        // Optionally generate a new session ID or keep old?
        // For simplicity, we assume analysis starts fresh or backend session is lost unless persisted.
        // We'll just notify user.
        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            agent: 'System',
            content: `会话已从文件恢复: ${data.metadata.well.name}`,
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

        setMessages(prev => [...prev, {
            id: Date.now().toString(),
            agent: 'System',
            content: `分析配置: 深度 ${config.startDepth}-${config.endDepth}m${config.focusNote ? `, 重点: ${config.focusNote}` : ''}`,
            confidence: 1.0,
            timestamp: new Date(),
        }]);

        try {
            const result = await api.runAnalysis(
                config.startDepth,
                config.endDepth,
                config.focusNote,
                sessionId
            );

            if (result.success && result.messages.length > 0) {
                for (const msg of result.messages) {
                    await new Promise(resolve => setTimeout(resolve, 800));
                    setMessages(prev => [...prev, {
                        id: Date.now().toString(),
                        agent: msg.agent,
                        content: msg.content,
                        confidence: msg.confidence,
                        timestamp: new Date(),
                        isFinal: msg.is_final,
                    }]);
                }
            }
        } catch (error: any) {
            console.error('Analysis failed:', error);
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                agent: 'System',
                content: `分析失败: ${error.message || '请检查后端服务'}`,
                confidence: 0,
                timestamp: new Date(),
            }]);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const depthRange = logData
        ? { min: logData.metadata.well.strt, max: logData.metadata.well.stop }
        : { min: 0, max: 0 };

    return (
        <div className="app-container">
            {/* Sidebar - Hidden in fullscreen */}
            {!isFullscreen && (
                <Sidebar activeView={activeView} onViewChange={setActiveView} />
            )}

            <main className="main-content" style={{ flex: 1 }}>
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
                    {/* Curve Panel - Constrained width */}
                    <div style={{
                        flex: 1,
                        minWidth: 400,
                        maxWidth: isFullscreen ? '100%' : 'calc(100% - 420px)',
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        overflow: 'hidden',
                    }}>
                        <CurvePanel
                            logData={logData}
                            isLoading={isLoading}
                            onLoadFile={handleLoadFile}
                            onRestoreSession={handleRestoreSession}
                            isFullscreen={isFullscreen}
                            onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
                        />
                    </div>

                    {/* Chat Panel - Hidden in fullscreen */}
                    {!isFullscreen && (
                        <div style={{ width: 420, borderLeft: '1px solid var(--border-color)' }}>
                            <ChatPanel
                                messages={messages}
                                isAnalyzing={isAnalyzing}
                                onStartAnalysis={handleRequestAnalysis}
                                canAnalyze={!!logData && !isAnalyzing}
                            />
                        </div>
                    )}
                </div>
            </main>

            <AnalysisConfigModal
                visible={showConfigModal}
                onClose={() => setShowConfigModal(false)}
                onConfirm={handleStartAnalysis}
                depthRange={depthRange}
            />
        </div>
    );
};

export default App;
