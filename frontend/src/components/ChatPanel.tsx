import {
    RobotOutlined,
    CheckCircleOutlined,
    LoadingOutlined,
    DoubleRightOutlined,
    DoubleLeftOutlined
} from '@ant-design/icons';

interface Message {
    id: string;
    agent: string;
    content: string;
    confidence: number;
    timestamp: Date;
    isFinal?: boolean;
}

interface ChatPanelProps {
    messages: Message[];
    isAnalyzing: boolean;
    canAnalyze: boolean;
    progressStatus?: string; // e.g., "第1轮，岩性专家正在分析..."
    onStartAnalysis: () => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
}

const agentColors: Record<string, string> = {
    LithologyExpert: '#f59e0b',
    ElectricalExpert: '#3b82f6',
    ReservoirPropertyExpert: '#10b981', // Emerald
    SaturationExpert: '#f43f5e', // Rose
    MudLoggingExpert: '#eab308', // Yellow
    MineralogyExpert: '#8b5cf6', // Violet
    Arbitrator: '#c084fc',
    System: '#22c55e',
};

const agentNames: Record<string, string> = {
    LithologyExpert: '岩性专家',
    ElectricalExpert: '电性专家',
    ReservoirPropertyExpert: '物性专家',
    SaturationExpert: '饱和度专家',
    MudLoggingExpert: '气测专家',
    MineralogyExpert: '矿物专家',
    Arbitrator: '决策者',
    System: '系统',
};

const ChatPanel: React.FC<ChatPanelProps> = ({
    messages,
    isAnalyzing,
    canAnalyze,
    progressStatus,
    onStartAnalysis,
    collapsed,
    onToggleCollapse
}) => {
    const roundCount = messages.filter(m => m.agent === 'Arbitrator').length || 0;

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-secondary)',
            position: 'relative'
        }}>
            {/* Header */}
            <div style={{
                padding: collapsed ? 'var(--spacing-md) 0' : 'var(--spacing-md) var(--spacing-lg)',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: collapsed ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 'var(--spacing-sm)'
            }}>
                {collapsed ? (
                    <div
                        onClick={onToggleCollapse}
                        style={{
                            cursor: 'pointer',
                            color: 'var(--accent-primary)',
                            fontSize: '1.2rem',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 16
                        }}
                    >
                        <DoubleLeftOutlined />
                        <div style={{
                            writingMode: 'vertical-rl',
                            textOrientation: 'mixed',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            letterSpacing: 4,
                            marginTop: 8,
                            color: 'var(--text-secondary)'
                        }}>
                            智能体协作
                        </div>
                    </div>
                ) : (
                    <>
                        <div
                            onClick={onToggleCollapse}
                            style={{
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                fontSize: '1.1rem',
                                marginRight: 4,
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <DoubleRightOutlined />
                        </div>
                        <RobotOutlined style={{ color: 'var(--accent-primary)' }} />
                        <span style={{ fontWeight: 600 }}>智能体协作讨论</span>
                        <span style={{
                            marginLeft: 'auto',
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)'
                        }}>
                            第 {roundCount + 1} 轮
                        </span>
                    </>
                )}
            </div>

            {/* Messages */}
            {!collapsed && (
                <div className="chat-container" style={{ flex: 1 }}>
                    {messages.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: 'var(--spacing-xl)',
                            color: 'var(--text-muted)'
                        }}>
                            <RobotOutlined style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }} />
                            <div>等待开始分析...</div>
                            <div style={{ fontSize: '0.85rem', marginTop: 8 }}>
                                加载数据后点击下方按钮开始
                            </div>
                        </div>
                    ) : (
                        messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`chat-message ${msg.isFinal ? '' : 'agent'} animate-fade-in`}
                                style={{
                                    borderLeftColor: msg.isFinal ? 'var(--success)' : agentColors[msg.agent],
                                    background: msg.isFinal ? 'rgba(34, 197, 94, 0.1)' : undefined,
                                }}
                            >
                                <div
                                    className="chat-avatar"
                                    style={{
                                        background: agentColors[msg.agent] || 'var(--accent-gradient)',
                                    }}
                                >
                                    {msg.agent[0]}
                                </div>
                                <div className="chat-content">
                                    <div className="chat-header">
                                        <span className="chat-name">{agentNames[msg.agent] || msg.agent}</span>
                                        {msg.isFinal && (
                                            <CheckCircleOutlined style={{ color: 'var(--success)' }} />
                                        )}
                                        <span className="chat-time">
                                            {msg.timestamp.toLocaleTimeString('zh-CN', {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </span>
                                    </div>
                                    <div className="chat-text">{msg.content}</div>
                                    {msg.agent !== 'System' && (
                                        <div style={{
                                            marginTop: 8,
                                            fontSize: '0.75rem',
                                            color: 'var(--text-muted)'
                                        }}>
                                            置信度:
                                            <span style={{
                                                color: msg.confidence > 0.8 ? 'var(--success)' :
                                                    msg.confidence > 0.6 ? 'var(--warning)' : 'var(--error)',
                                                marginLeft: 4,
                                                fontWeight: 600
                                            }}>
                                                {(msg.confidence * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}

                    {isAnalyzing && (
                        <div className="chat-message agent animate-fade-in" style={{ borderLeftColor: 'var(--accent-primary)' }}>
                            <div className="chat-avatar" style={{ background: 'var(--accent-gradient)' }}>
                                <LoadingOutlined spin />
                            </div>
                            <div className="chat-content">
                                <div className="chat-text" style={{ color: 'var(--accent-primary)' }}>
                                    智能体分析中...
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Footer */}
            {!collapsed && (
                <div style={{
                    padding: 'var(--spacing-md)',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    {/* Progress Status Display */}
                    {progressStatus && (
                        <div style={{
                            marginBottom: 'var(--spacing-sm)',
                            padding: '8px 12px',
                            background: 'rgba(139, 92, 246, 0.1)',
                            borderRadius: 6,
                            fontSize: '0.85rem',
                            color: 'var(--accent-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                        }}>
                            <LoadingOutlined spin style={{ fontSize: 14 }} />
                            <span>{progressStatus}</span>
                        </div>
                    )}
                    <button
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        onClick={onStartAnalysis}
                        disabled={!canAnalyze}
                    >
                        {isAnalyzing ? (
                            <>
                                <LoadingOutlined spin />
                                分析中...
                            </>
                        ) : (
                            '开始新一轮分析'
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};

export default ChatPanel;
