import React, { useState, useEffect, useCallback } from 'react';
import { HistoryOutlined, SearchOutlined, DeleteOutlined, EyeOutlined, LoadingOutlined, CloseOutlined } from '@ant-design/icons';
import api, { Conversation } from '../api/client';

interface HistoryPageProps {
    onNavigateBack: () => void;
    onRecall: (conversation: Conversation) => void;
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
    Router: '#71717a',
};

const agentNames: Record<string, string> = {
    LithologyExpert: '岩性专家',
    ElectricalExpert: '电性专家',
    ReservoirPropertyExpert: '物性专家',
    SaturationExpert: '饱和度专家',
    MudLoggingExpert: '气测专家',
    MineralogyExpert: '矿物专家',
    Arbitrator: '仲裁者',
    System: '系统',
    Router: '路由',
};

const HistoryPage: React.FC<HistoryPageProps> = ({ onNavigateBack, onRecall }) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const loadConversations = useCallback(async (search?: string) => {
        setLoading(true);
        try {
            const result = await api.listConversations({
                limit: 50,
                search: search
            });
            if (result.success) {
                setConversations(result.data);
                setTotal(result.total);
            }
        } catch (error) {
            console.error('Failed to load conversations:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadConversations();
    }, [loadConversations]);

    const handleSearch = () => {
        loadConversations(searchQuery);
    };

    const handleViewDetail = async (conversation: Conversation) => {
        setDetailLoading(true);
        try {
            const result = await api.getConversation(conversation._id);
            if (result.success) {
                setSelectedConversation(result.data);
            }
        } catch (error) {
            console.error('Failed to load conversation detail:', error);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('确定要删除这条记录吗？')) return;

        try {
            const result = await api.deleteConversation(id);
            if (result.success) {
                setConversations(prev => prev.filter(c => c._id !== id));
                setTotal(prev => prev - 1);
                if (selectedConversation?._id === id) {
                    setSelectedConversation(null);
                }
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error);
        }
    };

    const formatDate = (timestamp: string) => {
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
            {/* Header */}
            <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'var(--bg-secondary)'
            }}>
                <HistoryOutlined style={{ fontSize: 20, color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: 16, fontWeight: 600 }}>分析历史记录</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
                    共 {total} 条记录
                </span>
                <div style={{ marginLeft: 'auto' }}>
                    <button className="btn btn-ghost" onClick={onNavigateBack}>
                        返回分析
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                    <input
                        type="text"
                        placeholder="搜索问题关键词..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: 14
                        }}
                    />
                    <button className="btn btn-primary" onClick={handleSearch}>
                        <SearchOutlined /> 搜索
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* List Panel */}
                <div style={{
                    width: selectedConversation ? '40%' : '100%',
                    borderRight: selectedConversation ? '1px solid var(--border-color)' : 'none',
                    overflow: 'auto',
                    transition: 'width 0.3s ease'
                }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <LoadingOutlined spin style={{ fontSize: 24 }} />
                            <div style={{ marginTop: 12 }}>加载中...</div>
                        </div>
                    ) : conversations.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            <HistoryOutlined style={{ fontSize: 48, opacity: 0.3 }} />
                            <div style={{ marginTop: 12 }}>暂无历史记录</div>
                        </div>
                    ) : (
                        <div style={{ padding: 12 }}>
                            {conversations.map((conv) => (
                                <div
                                    key={conv._id}
                                    onClick={() => handleViewDetail(conv)}
                                    style={{
                                        padding: 16,
                                        marginBottom: 12,
                                        borderRadius: 8,
                                        background: selectedConversation?._id === conv._id
                                            ? 'rgba(139, 92, 246, 0.15)'
                                            : 'var(--bg-secondary)',
                                        border: selectedConversation?._id === conv._id
                                            ? '1px solid var(--accent-primary)'
                                            : '1px solid var(--border-color)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {/* Header Row */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                                            🛢 {conv.well_name}
                                        </span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {formatDate(conv.timestamp)}
                                        </span>
                                    </div>

                                    {/* Depth & Question */}
                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                                        深度 {conv.depth_range.start}-{conv.depth_range.end}m | {conv.user_question}
                                    </div>

                                    {/* Final Decision */}
                                    {conv.final_decision && (
                                        <div style={{
                                            fontSize: 13,
                                            color: 'var(--success)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8
                                        }}>
                                            ✅ {conv.final_decision.decision}
                                            <span style={{
                                                fontSize: 11,
                                                color: 'var(--text-muted)',
                                                marginLeft: 'auto'
                                            }}>
                                                置信度 {((conv.final_decision.confidence || 0) * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div style={{
                                        display: 'flex',
                                        gap: 8,
                                        marginTop: 12,
                                        paddingTop: 12,
                                        borderTop: '1px solid var(--border-color)'
                                    }}>
                                        {/* Agent Indicators */}
                                        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                            {Array.from(new Set(conv.messages.map(m => m.agent))).map(agent => (
                                                <span
                                                    key={agent}
                                                    style={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: '50%',
                                                        backgroundColor: agentColors[agent] || '#888',
                                                    }}
                                                    title={agentNames[agent] || agent}
                                                />
                                            ))}
                                        </div>
                                        <button
                                            className="btn btn-ghost"
                                            style={{ padding: '4px 8px', fontSize: 11 }}
                                            onClick={(e) => { e.stopPropagation(); handleViewDetail(conv); }}
                                        >
                                            <EyeOutlined /> 查看
                                        </button>
                                        <button
                                            className="btn btn-ghost"
                                            style={{ padding: '4px 8px', fontSize: 11, color: 'var(--error)' }}
                                            onClick={(e) => handleDelete(conv._id, e)}
                                        >
                                            <DeleteOutlined /> 删除
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detail Panel */}
                {selectedConversation && (
                    <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)' }}>
                        {detailLoading ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                                <LoadingOutlined spin style={{ fontSize: 24 }} />
                            </div>
                        ) : (
                            <div style={{ padding: 20 }}>
                                {/* Detail Header */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 20
                                }}>
                                    <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>
                                        分析详情
                                    </h3>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            className="btn btn-primary"
                                            style={{ fontSize: 13 }}
                                            onClick={() => onRecall(selectedConversation)}
                                        >
                                            继续分析
                                        </button>
                                        <button
                                            className="btn btn-ghost"
                                            onClick={() => setSelectedConversation(null)}
                                        >
                                            <CloseOutlined />
                                        </button>
                                    </div>
                                </div>

                                {/* Basic Info */}
                                <div style={{
                                    padding: 16,
                                    background: 'var(--bg-secondary)',
                                    borderRadius: 8,
                                    marginBottom: 16
                                }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>基本信息</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                                        <div>井名：<span style={{ color: 'var(--text-primary)' }}>{selectedConversation.well_name}</span></div>
                                        <div>时间：<span style={{ color: 'var(--text-primary)' }}>{formatDate(selectedConversation.timestamp)}</span></div>
                                        <div>深度：<span style={{ color: 'var(--text-primary)' }}>{selectedConversation.depth_range.start}-{selectedConversation.depth_range.end}m</span></div>
                                        <div>问题：<span style={{ color: 'var(--text-primary)' }}>{selectedConversation.user_question}</span></div>
                                    </div>
                                </div>

                                {/* Messages Timeline */}
                                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                                    💬 对话记录
                                </div>
                                {selectedConversation.messages.map((msg, index) => (
                                    <div
                                        key={index}
                                        style={{
                                            padding: 12,
                                            marginBottom: 8,
                                            borderRadius: 8,
                                            background: msg.is_final ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-secondary)',
                                            borderLeft: `3px solid ${agentColors[msg.agent] || '#888'}`
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            marginBottom: 8
                                        }}>
                                            <span style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: '50%',
                                                background: agentColors[msg.agent] || '#888',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 10,
                                                fontWeight: 'bold',
                                                color: 'white'
                                            }}>
                                                {msg.agent[0]}
                                            </span>
                                            <span style={{ fontWeight: 600, fontSize: 13 }}>
                                                {agentNames[msg.agent] || msg.agent}
                                            </span>
                                            {msg.is_final && (
                                                <span style={{
                                                    fontSize: 10,
                                                    background: 'var(--success)',
                                                    color: 'white',
                                                    padding: '2px 6px',
                                                    borderRadius: 4
                                                }}>
                                                    最终结论
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                                            {msg.content}
                                        </div>
                                        {msg.confidence > 0 && (
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                                                置信度: {(msg.confidence * 100).toFixed(0)}%
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HistoryPage;
