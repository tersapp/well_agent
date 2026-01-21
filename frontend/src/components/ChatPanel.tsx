import React, { useRef, useEffect } from 'react';
import { Button, Input, Card, Spin, Space, Empty, Collapse } from 'antd';
import { SendOutlined, StopOutlined, DeleteOutlined, RobotOutlined, UserOutlined, MenuOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from 'ai';
import SmartChart from './SmartChart';

interface ChatPanelProps {
    messages: Message[];
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (e: React.FormEvent) => void;
    isLoading: boolean;
    stop: () => void;
    setMessages: (messages: Message[]) => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
    progressStatus?: string;
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
}

const agentColors: Record<string, string> = {
    // ... (unchanged)
};

const agentNames: Record<string, string> = {
    // ... (unchanged)
};

const markdownComponents: Components = {
    code(props: any) {
        const { node, inline, className, children, ...rest } = props;
        const match = /language-(\w+)/.exec(className || '');
        if (!inline && match && match[1] === 'echarts') {
            try {
                const config = JSON.parse(String(children).replace(/\n$/, ''));
                return <SmartChart config={config} />;
            } catch (e) {
                return (
                    <div style={{ color: 'red', border: '1px solid red', padding: 8 }}>
                        Chart Rendering Error: Invalid JSON
                    </div>
                );
            }
        }
        return <code className={className} {...rest}>{children}</code>;
    }
};

const ChatPanel: React.FC<ChatPanelProps> = ({
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    // reload, // unused
    setMessages,
    collapsed,
    onToggleCollapse,
    progressStatus,
    isFullscreen,
    onToggleFullscreen
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    console.log('[ChatPanel] Messages prop:', messages); // DEBUG LOG

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading, progressStatus]);

    if (collapsed) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--bg-secondary)',
                borderLeft: '1px solid var(--border-color)',
                alignItems: 'center',
                paddingTop: 16,
                width: 40
            }}>
                <Button type="text" onClick={onToggleCollapse} icon={<MenuOutlined />} />
            </div>
        );
    }

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg-secondary)',
            position: 'relative'
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-primary)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RobotOutlined style={{ color: '#1890ff' }} />
                    <span style={{ fontWeight: 600 }}>智能分析助手</span>
                    {isLoading && <Spin size="small" />}
                </div>
                <Space>
                    {onToggleFullscreen && (
                        <Button
                            type="text"
                            icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                            onClick={onToggleFullscreen}
                            title={isFullscreen ? "退出全屏" : "全屏模式"}
                        />
                    )}
                    <Button
                        type="text"
                        icon={<DeleteOutlined />}
                        onClick={() => setMessages([])}
                        title="清空对话"
                    />
                    <Button type="text" onClick={onToggleCollapse}>
                        {collapsed ? '<<' : '>>'}
                    </Button>
                </Space>
            </div>

            {/* Messages Area */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 16
            }}>
                {messages.length === 0 ? (
                    <Empty description="暂无对话，请开始分析或提问" style={{ marginTop: 60 }} />
                ) : (
                    messages.map((m) => {
                        const isUser = m.role === 'user';

                        if (isUser) {
                            return (
                                <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <div style={{ maxWidth: '90%', display: 'flex', gap: 8, flexDirection: 'row-reverse' }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            backgroundColor: agentColors['user'],
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', flexShrink: 0, marginTop: 4
                                        }}>
                                            <UserOutlined />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                            <Card size="small" style={{
                                                backgroundColor: 'var(--accent-secondary)', // Use accent color for user
                                                borderColor: 'var(--accent-secondary)',
                                                color: '#fff' // Force white text on accent
                                            }} bodyStyle={{ padding: '8px 12px' }}>
                                                <div className="markdown-body" style={{ fontSize: 13, lineHeight: 1.6, color: 'inherit' }}>
                                                    {m.content}
                                                </div>
                                            </Card>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // For assistant, try to split by "**AgentName**:" pattern
                        // Regex to find all "**Name**: " blocks
                        // Regex to find all "**Name**: " blocks
                        // We capture the name and the content following it
                        // FIX: Don't trim() filter, as it removes pure whitespace content (like newlines)
                        const parts = m.content.split(/(\*\*.+?\*\*:\s)/g).filter(p => p !== "");

                        // Identify if this is a "structured" multi-agent message
                        const isStructured = parts.length > 0 && parts[0].startsWith('**') && parts[0].endsWith(': ');

                        if (!isStructured) {
                            // Fallback for single assistant message or if format doesn't match
                            return (
                                <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                    <div style={{ maxWidth: '90%', display: 'flex', gap: 8 }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            backgroundColor: agentColors['assistant'],
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', flexShrink: 0, marginTop: 4
                                        }}>
                                            <RobotOutlined />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2, marginLeft: 2 }}>
                                                {agentNames['assistant']}
                                            </span>
                                            <Card size="small" style={{
                                                backgroundColor: 'var(--bg-card)',
                                                borderColor: 'var(--border-color)',
                                                color: 'var(--text-primary)'
                                            }} bodyStyle={{ padding: '8px 12px' }}>
                                                <div className="markdown-body" style={{ fontSize: 13, lineHeight: 1.6, color: 'inherit' }}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{m.content}</ReactMarkdown>
                                                </div>
                                            </Card>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // Render structured chunks
                        const chunks: { agent: string, content: string }[] = [];
                        let currentAgent = 'System';
                        let currentContent: string[] = [];

                        // Re-assemble parts
                        for (let i = 0; i < parts.length; i++) {
                            const part = parts[i];
                            const agentMatch = part.match(/^\*\*(.+?)\*\*:\s$/);
                            if (agentMatch) {
                                // If we have accumulated content for previous agent, push it
                                if (currentContent.length > 0) {
                                    chunks.push({ agent: currentAgent, content: currentContent.join('') });
                                    currentContent = [];
                                }
                                // Set new agent
                                currentAgent = agentMatch[1];
                            } else {
                                currentContent.push(part);
                            }
                        }
                        // Push last chunk
                        if (currentContent.length > 0) {
                            chunks.push({ agent: currentAgent, content: currentContent.join('') });
                        }

                        // Fallback: If structured parsing resulted in no chunks (unlikely given isStructured check, but possible if content is empty), render raw
                        // Fallback: If structured parsing resulted in no chunks, render raw content
                        if (chunks.length === 0) {
                            return (
                                <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                    <div style={{ maxWidth: '90%', display: 'flex', gap: 8 }}>
                                        <div style={{
                                            width: 28, height: 28, borderRadius: '50%',
                                            backgroundColor: agentColors['assistant'],
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', flexShrink: 0, marginTop: 4
                                        }}>
                                            <RobotOutlined />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2, marginLeft: 2 }}>
                                                {agentNames['assistant']}
                                            </span>
                                            <Card size="small" style={{
                                                backgroundColor: 'var(--bg-card)',
                                                borderColor: 'var(--border-color)',
                                                color: 'var(--text-primary)'
                                            }} bodyStyle={{ padding: '8px 12px' }}>
                                                <div className="markdown-body" style={{ fontSize: 13, lineHeight: 1.6, color: 'inherit' }}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                                                </div>
                                            </Card>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        // Partition chunks into "Process" (Intermediate) and "Result" (Arbitrator/Final)
                        // Heuristic: "Arbitrator" is the main speaker. Others are tools/experts.
                        // We will group all non-Arbitrator chunks into a single "Thought Chain" block if they appear before the final answer.
                        // However, sometimes Arbitrator speaks first (Planning), then Experts, then Arbitrator (Summary).
                        // A simple robust way: Render chunks sequentially, but if a chunk is NOT Arbitrator, put it in a collapsible group?
                        // Better: Just group ALL non-Arbitrator chunks into a Collapse? 
                        // Issue: If Arbitrator speaks, then Expert, then Arbitrator, we might want to see the sequence.

                        // Let's try: Group consecutive non-Arbitrator chunks.
                        const groupedChunks: { type: 'process' | 'result', items: typeof chunks }[] = [];

                        let currentGroup: typeof chunks = [];
                        let isCollectingProcess = false;

                        chunks.forEach(chunk => {
                            const isArbitrator = chunk.agent === 'Arbitrator';

                            if (!isArbitrator) {
                                // This is a process step
                                if (!isCollectingProcess) {
                                    // Start new process group
                                    // First flush specific result if exists (though usually process comes first or interleaved)
                                    // Actually, if we were collecting results, we should push them.
                                    // But we are processing strictly sequential.
                                    // Wait, the logic is simpler:
                                    // If we are currently collecting process, just add.
                                    // If we were NOT, switch to collecting process.
                                }
                                currentGroup.push(chunk);
                                isCollectingProcess = true;
                            } else {
                                // This is a result step (Arbitrator)
                                if (isCollectingProcess) {
                                    // Finish the process group
                                    groupedChunks.push({ type: 'process', items: [...currentGroup] });
                                    currentGroup = [];
                                    isCollectingProcess = false;
                                }
                                // Push this result individually (or group consecutive Arbitrator messages? usually just one)
                                groupedChunks.push({ type: 'result', items: [chunk] });
                            }
                        });

                        // Flush remaining
                        if (currentGroup.length > 0) {
                            groupedChunks.push({ type: isCollectingProcess ? 'process' : 'result', items: currentGroup });
                        }

                        return (
                            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {groupedChunks.map((group, gIdx) => {
                                    if (group.type === 'process') {
                                        return (
                                            <Collapse
                                                key={`group-${gIdx}`}
                                                ghost
                                                size="small"
                                                items={[{
                                                    key: '1',
                                                    label: <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                                        <Space>
                                                            <RobotOutlined />
                                                            <span>分析过程 ({group.items.length} 步)</span>
                                                            <Space size={4}>
                                                                {group.items.map((it, i) => (
                                                                    <span key={i} title={it.agent} style={{
                                                                        width: 6, height: 6,
                                                                        borderRadius: '50%',
                                                                        backgroundColor: agentColors[Object.keys(agentNames).find(key => agentNames[key] === it.agent) || 'System'] || '#ccc',
                                                                        display: 'inline-block'
                                                                    }} />
                                                                ))}
                                                            </Space>
                                                        </Space>
                                                    </div>,
                                                    children: (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 14, borderLeft: '2px solid var(--border-color)' }}>
                                                            {group.items.map((chunk, cIdx) => (
                                                                <div key={`proc-${cIdx}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                                                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2, fontWeight: 500 }}>
                                                                        {chunk.agent}
                                                                    </span>
                                                                    <Card size="small" style={{ width: '100%', opacity: 0.9 }} bodyStyle={{ padding: '8px 12px' }}>
                                                                        <div className="markdown-body" style={{ fontSize: 13, lineHeight: 1.6 }}>
                                                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{chunk.content}</ReactMarkdown>
                                                                        </div>
                                                                    </Card>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )
                                                }]}
                                            />
                                        );
                                    } else {
                                        // Result (Arbitrator)
                                        return group.items.map((chunk, cIdx) => (
                                            <div key={`res-${gIdx}-${cIdx}`} style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                                <div style={{ maxWidth: '90%', display: 'flex', gap: 8 }}>
                                                    <div style={{
                                                        width: 28, height: 28, borderRadius: '50%',
                                                        backgroundColor: agentColors['assistant'],
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: 'white', flexShrink: 0, marginTop: 4,
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                    }}>
                                                        <RobotOutlined />
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2, marginLeft: 2 }}>
                                                            {agentNames['assistant']}
                                                        </span>
                                                        <Card size="small" style={{
                                                            backgroundColor: 'var(--bg-card)',
                                                            borderColor: 'var(--border-color)',
                                                            color: 'var(--text-primary)',
                                                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                                                        }} bodyStyle={{ padding: '12px 16px' }}>
                                                            <div className="markdown-body" style={{ fontSize: 14, lineHeight: 1.6, color: 'inherit' }}>
                                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{chunk.content}</ReactMarkdown>
                                                            </div>
                                                        </Card>
                                                    </div>
                                                </div>
                                            </div>
                                        ));
                                    }
                                })}
                            </div>
                        );
                    })
                )}

                {/* Status Indicator */}
                {isLoading && progressStatus && (
                    <div style={{
                        padding: '8px 12px',
                        background: 'rgba(24, 144, 255, 0.05)',
                        border: '1px dashed #1890ff',
                        borderRadius: 4,
                        color: '#1890ff',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        margin: '0 40px'
                    }}>
                        <Spin size="small" />
                        <span>{progressStatus}</span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{
                padding: 16,
                borderTop: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)'
            }}>
                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Input.TextArea
                            value={input}
                            onChange={handleInputChange}
                            placeholder="输入您的问题..."
                            autoSize={{ minRows: 1, maxRows: 4 }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit(e as any);
                                }
                            }}
                            disabled={isLoading}
                        />
                        {isLoading ? (
                            <Button danger icon={<StopOutlined />} onClick={stop} style={{ height: 'auto' }}>停止</Button>
                        ) : (
                            <Button type="primary" htmlType="submit" icon={<SendOutlined />} style={{ height: 'auto' }}>发送</Button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChatPanel;
