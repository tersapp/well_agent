import React, { useState, useRef } from 'react';
import Sidebar from './components/Sidebar';
import CurvePanel from './components/CurvePanel';
import ChatPanel from './components/ChatPanel';
import HistoryPage from './components/HistoryPage';
import AnalysisConfigModal, { AnalysisConfig } from './components/AnalysisConfigModal';
import CurveMappingModal from './components/CurveMappingModal';
import { Modal } from 'antd';
import api, { Conversation } from './api/client';
import { useChat } from 'ai/react';
import { Message } from 'ai';

// ...

// const handleRequestAnalysis = () => {  <-- Removed unused function
//    setShowConfigModal(true);
// };

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

// Local Message interface removed, using 'ai' import
// Conflicting state removed

const App: React.FC = () => {
    const [activeView, setActiveView] = useState<'analysis' | 'report' | 'history' | 'generation' | 'logs'>('analysis');
    const [logData, setLogData] = useState<LogData | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const [isLoadingFile, setIsLoadingFile] = useState(false); // Renamed from isLoading
    // const [isAnalyzing, setIsAnalyzing] = useState(false); // Removed, provided by useChat
    const [progressStatus, setProgressStatus] = useState<string>('');
    // const [messages, setMessages] = useState<Message[]>([]); // Removed, provided by useChat
    const [showConfigModal, setShowConfigModal] = useState(false);
    // 'none' | 'curve' | 'chat'
    const [fullscreenMode, setFullscreenMode] = useState<'none' | 'curve' | 'chat'>('none');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [chatPanelCollapsed, setChatPanelCollapsed] = useState(false);

    // Curve mapping state
    const [showMappingModal, setShowMappingModal] = useState(false);
    const [curveMapping, setCurveMapping] = useState<any>(null);
    const [standardTypes, setStandardTypes] = useState<Record<string, any>>({});
    const [llmSuggestions, setLlmSuggestions] = useState<Record<string, string | null>>({});
    const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [activeDepthRange, setActiveDepthRange] = useState<{ start: number; end: number } | null>(null);

    // Config needed for the "initial" analysis request
    const pendingConfigRef = useRef<AnalysisConfig | null>(null);

    // Custom fetcher for Vercel AI SDK to bridge our existing API
    const customFetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
        // Parse the body to get the latest message user sent
        let body: any = {};
        if (init && init.body) {
            body = JSON.parse(init.body as string);
        }

        // Determine request type
        const messages = body.messages || [];
        const lastMessage = messages[messages.length - 1];
        const userContent = lastMessage ? lastMessage.content : '';

        // We use a TransformStream to convert our SSE events to Vercel AI SDK text stream
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        // If we have a pending config (start analysis), use it. Otherwise treat as follow-up.
        const config = pendingConfigRef.current;
        const isInitialAnalysis = !!config;

        let targetId = sessionId;
        let useConvId = currentConversationId;

        // If starting fresh analysis, we might reset conversation ID (unless continuing context?)
        // Actually, our API handles "new analysis" by not passing conversation_id or passing it.
        // For Vercel SDK, we usually just append messages.

        // Logic to trigger our existing streaming API
        try {
            const startDepth = isInitialAnalysis ? config.startDepth : (activeDepthRange?.start || 0);
            const endDepth = isInitialAnalysis ? config.endDepth : (activeDepthRange?.end || 0);
            const note = isInitialAnalysis ? config.focusNote : userContent; // For initial, focusNote is the "prompt"

            // If it's follow up, we just use the user content as "note" effectively, 
            // but our API currently uses 'focusNote' as the primary instruction. 
            // Ideally, we should unify this. Currently createStreamingAnalysis takes focusNote.

            const agentNames: Record<string, string> = {
                LithologyExpert: '岩性专家',
                ElectricalExpert: '电性专家',
                ReservoirPropertyExpert: '物性专家',
                SaturationExpert: '饱和度专家',
                MudLoggingExpert: '气测专家',
                MineralogyExpert: '矿物专家',
                Arbitrator: '仲裁者',
                System: '系统',
            };

            // Use append to trigger the analysis request (see below)
            api.createStreamingAnalysis(
                startDepth,
                endDepth,
                note,
                targetId,
                (data) => {
                    if (data.type === 'context') {
                        if (data.conversation_id) {
                            setCurrentConversationId(data.conversation_id);
                            useConvId = data.conversation_id;
                        }
                    } else if (data.type === 'agent_message') {
                        // Vercel AI SDK expects text chunks. 
                        // We format our agent messages into Markdown for the stream.
                        const displayName = agentNames[data.agent || ''] || data.agent;
                        setProgressStatus(`${displayName}正在分析...`);

                        // Format: "**AgentName**: Content\n\n"
                        // Note: Vercel AI SDK simply accumulates text. 
                        // If we want "per agent" bubbles, we need structured tools or custom parsing.
                        // Option B was "Ant Design Custom", so we can use markdown to render nicely.
                        const chunk = `**${displayName}**: ${data.content}\n\n`;
                        // FIX: Vercel AI SDK expects Data Stream Protocol (0: "text")
                        const streamChunk = '0:' + JSON.stringify(chunk) + '\n';
                        console.log('[App] Received chunk:', chunk); // KEEP DEBUG LOG
                        writer.write(encoder.encode(streamChunk));

                        setTimeout(() => {
                            setProgressStatus(`${displayName}分析完成`);
                        }, 100);

                    } else if (data.type === 'error') {
                        const chunk = `\n\n**系统错误**: ${data.message}\n`;
                        const streamChunk = '0:' + JSON.stringify(chunk) + '\n';
                        console.log('[App] Received Error chunk:', chunk); // KEEP DEBUG LOG
                        writer.write(encoder.encode(streamChunk));
                    }
                },
                (error) => {
                    // HACK: Handle 409 Context Mismatch inside the fetcher?
                    // It's hard to trigger UI modal from here and retry transparently.
                    // IMPORTANT: We might need to bubble this up or handle it via a global event/callback?
                    // For now, let's write error to stream so user sees it.
                    // Ideally we catch this BEFORE stream starts if possible (the initial fetch).
                    // But createStreamingAnalysis handles the fetch internally.

                    if (error && error.status === 409 && error.detail && error.detail.code === 'CONTEXT_MISMATCH') {
                        // We need to trigger the modal from App scope.
                        // We can emit a custom event or callback.
                        // But since we are inside `customFetcher`, we accept we might display the error first.
                        // OR we reject this promise, causing `useChat` to error

                        // Let's rely on the previous logic style:
                        // Convert error to a special string we can parse? 
                        // Or just show the error.

                        // Better: We expose `handleContextMismatch` to be callable here? 
                        // No, `customFetcher` is defined inside component, so it can access component scope!

                        const detail = error.detail;
                        Modal.confirm({
                            title: '上下文不一致',
                            content: detail.message,
                            okText: '切换并继续',
                            cancelText: '取消',
                            onOk: async () => {
                                try {
                                    const result = await api.getSessionData(detail.expected_session_id);
                                    if (result.success) {
                                        setLogData(result.data);
                                        setSessionId(detail.expected_session_id);
                                        // Retry not easily possible inside this stream "resume"
                                        // But user can just click "Regenerate" or "Send" again after switch.
                                        writer.write(encoder.encode(`\n**系统提示**: 已自动切换到会话上下文 (${detail.expected_session_id})。请重新提交请求。`));
                                    }
                                } catch (e) {
                                    writer.write(encoder.encode(`\n**系统错误**: 切换上下文失败。`));
                                }
                                writer.close();
                            },
                            onCancel: () => {
                                writer.write(encoder.encode(`\n**系统提示**: 操作已取消。`));
                                writer.close();
                            }
                        });
                        return;
                    }

                    writer.write(encoder.encode(`\n**Error**: ${error.message || 'Unknown error'}`));
                    writer.close();
                },
                () => {
                    writer.close();
                    setProgressStatus('');
                    pendingConfigRef.current = null; // Clear pending config
                },
                useConvId || undefined
            );
        } catch (err) {
            writer.write(encoder.encode(`\nFailed to start analysis.`));
            writer.close();
        }

        return new Response(readable, {
            headers: { 'Content-Type': 'text/plain' }
        });
    };

    // Vercel AI SDK Hook
    const { messages, input, handleInputChange, handleSubmit, isLoading: isChatLoading, stop, setMessages, append } = useChat({
        api: 'custom', // We don't use this URL, we override fetcher
        fetch: customFetcher,
        onError: (err: any) => {
            console.error("Chat error", err);
        }
    });

    const handleLoadFile = async (file: File) => {
        setIsLoadingFile(true);
        try {
            const result = await api.parseLasFile(file);
            if (result.success) {
                setLogData(result.data);
                setSessionId(result.session_id);
                // Reset chat for new file
                setMessages([{
                    id: Date.now().toString(),
                    role: 'system',
                    content: `已成功加载: ${file.name}\n深度范围: ${result.data.metadata.well.strt} - ${result.data.metadata.well.stop} m\n${result.qc_report.pass ? '✓ 质控通过' : '⚠ 质控有问题'}`
                }]);

                if (result.qc_report.warnings.length > 0) {
                    // Add warning message
                    // We can't easily "append" to state directly with useChat unless we mutate or use setMessages with prev.
                    // setMessages allows function update.
                }

                // ... (Mapping logic same as before)
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
                    } catch (e) { console.error(e); }

                    setIsLoadingSuggestions(true);
                    setShowMappingModal(true);
                    try {
                        const suggestResult = await api.suggestCurveMapping(result.session_id);
                        if (suggestResult.success) setLlmSuggestions(suggestResult.suggestions);
                    } catch (e) { console.error(e); } finally { setIsLoadingSuggestions(false); }
                }
            }
        } catch (error: any) {
            console.error('Failed to load file:', error);
            setMessages([{
                id: Date.now().toString(),
                role: 'system',
                content: `文件加载失败: ${error.message}`
            }]);
        } finally {
            setIsLoadingFile(false);
        }
    };

    const handleRestoreSession = (data: LogData) => {
        setLogData(data);
        const generatedSessionId = `restored_${data.metadata.well.name || 'unknown'}_${Date.now()}`;
        setSessionId(generatedSessionId);
        setMessages([{
            id: Date.now().toString(),
            role: 'system',
            content: `会话已从文件恢复: ${data.metadata.well.name}`
        }]);
    };

    const handleMappingConfirm = async (mappings: Record<string, string>, shouldSave: boolean) => {
        if (shouldSave) {
            try {
                const result = await api.saveCurveMapping(mappings);
                if (result.success) {
                    // Notify user
                }
            } catch (error) { console.error(error); }
        }
        setShowMappingModal(false);
    };


    const handleRecallConversation = (conv: Conversation) => {
        setActiveView('analysis');
        setCurrentConversationId(conv._id);
        setActiveDepthRange(conv.depth_range);

        // Convert API messages to Vercel AI SDK Messages
        // Note: roles need to be mapped. 'user' -> 'user', others -> 'assistant'?
        const appMessages: Message[] = conv.messages.map((m, idx) => ({
            id: `hist_${idx}_${Date.now()}`,
            role: m.agent === 'user' ? 'user' : 'assistant',
            content: m.agent !== 'user' ? `**${m.agent}**: ${m.content}` : m.content,
        }));
        setMessages(appMessages);
        setChatPanelCollapsed(false);
    };

    // Called when user clicks "Start" in Modal
    const handleStartAnalysisConfig = async (config: AnalysisConfig, overrideSessionId?: string) => {
        setShowConfigModal(false);
        if (!logData) return;

        // Set pending config for the fetcher to use
        pendingConfigRef.current = config;

        // If overrideSessionId is present, update state first
        if (overrideSessionId) {
            setSessionId(overrideSessionId);
        }

        // Use append to trigger the analysis request
        if (!currentConversationId) {
            setMessages([]);
        }

        // Construct the prompt message
        const prompt = `分析深度 ${config.startDepth}-${config.endDepth}m` + (config.focusNote ? `，重点关注：${config.focusNote}` : '');

        // Update depth range state
        setActiveDepthRange({ start: config.startDepth, end: config.endDepth });

        // Trigger chat
        append({
            id: Date.now().toString(),
            role: 'user',
            content: prompt
        });
    };

    const depthRange = logData
        ? { min: logData.metadata.well.strt, max: logData.metadata.well.stop }
        : { min: 0, max: 0 };

    const [chatPanelWidth, setChatPanelWidth] = useState(420);
    const isResizingRef = useRef(false);

    // Resizing Logic
    const startResizing = React.useCallback((_e: React.MouseEvent) => {
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', stopResizing);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // Prevent text selection
    }, []);

    const handleMouseMove = React.useCallback((e: MouseEvent) => {
        if (!isResizingRef.current) return;
        // Calculate new width: Total Width - Mouse X
        // Assuming ChatPanel is on the right
        const newWidth = window.innerWidth - e.clientX;
        // Constraints
        if (newWidth > 300 && newWidth < 800) {
            setChatPanelWidth(newWidth);
        }
    }, []);

    const stopResizing = React.useCallback(() => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', stopResizing);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = '';
    }, [handleMouseMove]);

    return (
        <div className="app-container">
            {/* Sidebar */}
            {fullscreenMode === 'none' && (
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
                    <HistoryPage
                        onNavigateBack={() => setActiveView('analysis')}
                        onRecall={handleRecallConversation}
                    />
                ) : activeView === 'generation' ? (
                    <div className="placeholder-view" style={{ padding: 40, textAlign: 'center' }}><h2>智能生成</h2><p>开发中...</p></div>
                ) : activeView === 'logs' ? (
                    <div className="placeholder-view" style={{ padding: 40, textAlign: 'center' }}><h2>操作日志</h2><p>初始化中...</p></div>
                ) : activeView === 'report' ? (
                    <div className="placeholder-view" style={{ padding: 40, textAlign: 'center' }}><h2>报告生成</h2><p>开发中...</p></div>
                ) : (
                    <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
                        {/* Curve Panel Container */}
                        <div style={{
                            flex: 1,
                            minWidth: 400,
                            display: fullscreenMode === 'chat' ? 'none' : 'flex', // Hide when chat is fullscreen
                            maxWidth: fullscreenMode === 'curve' ? '100%' : `calc(100% - ${chatPanelCollapsed ? '40px' : (fullscreenMode === 'none' ? `${chatPanelWidth}px` : '420px')})`,
                            flexDirection: 'column', height: '100%', overflow: 'hidden',
                            transition: isResizingRef.current ? 'none' : 'max-width 0.1s ease'
                        }}>
                            <CurvePanel
                                logData={logData}
                                isLoading={isLoadingFile}
                                onLoadFile={handleLoadFile}
                                onRestoreSession={handleRestoreSession}
                                isFullscreen={fullscreenMode === 'curve'}
                                onToggleFullscreen={() => setFullscreenMode(mode => mode === 'curve' ? 'none' : 'curve')}
                                onAnalysisRequest={(start, end, note) => {
                                    setActiveView('analysis');
                                    setChatPanelCollapsed(false);
                                    setCurrentConversationId(null);
                                    setActiveDepthRange({ start, end });
                                    handleStartAnalysisConfig({ startDepth: start, endDepth: end, focusNote: note });
                                }}
                            />
                        </div>

                        {/* Resizer Handle */}
                        {fullscreenMode === 'none' && !chatPanelCollapsed && (
                            <div
                                onMouseDown={startResizing}
                                style={{
                                    width: 4,
                                    cursor: 'col-resize',
                                    backgroundColor: 'transparent',
                                    zIndex: 10,
                                    borderLeft: '1px solid var(--border-color)',
                                    transition: 'background-color 0.2s',
                                }}
                                className="resizer-handle"
                            />
                        )}

                        {/* Chat Panel Container */}
                        {fullscreenMode !== 'curve' && (
                            <div style={{
                                width: fullscreenMode === 'chat' ? '100%' : (chatPanelCollapsed ? 40 : chatPanelWidth),
                                borderLeft: fullscreenMode === 'chat' ? 'none' : '1px solid var(--border-color)',
                                transition: isResizingRef.current ? 'none' : 'width 0.2s ease', // Disable transition during drag
                                overflow: 'hidden',
                                position: 'relative',
                                display: 'flex', flexDirection: 'column'
                            }}>
                                <ChatPanel
                                    messages={messages}
                                    input={input}
                                    handleInputChange={handleInputChange}
                                    handleSubmit={handleSubmit}
                                    isLoading={isChatLoading}
                                    stop={stop}
                                    setMessages={setMessages}
                                    progressStatus={progressStatus}
                                    collapsed={chatPanelCollapsed}
                                    onToggleCollapse={() => setChatPanelCollapsed(!chatPanelCollapsed)}
                                    isFullscreen={fullscreenMode === 'chat'}
                                    onToggleFullscreen={() => setFullscreenMode(mode => mode === 'chat' ? 'none' : 'chat')}
                                />
                            </div>
                        )}
                    </div>
                )}
            </main>

            <AnalysisConfigModal
                visible={showConfigModal}
                onClose={() => setShowConfigModal(false)}
                onConfirm={handleStartAnalysisConfig}
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
