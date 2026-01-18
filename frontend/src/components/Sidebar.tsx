import {
    DatabaseOutlined,
    LineChartOutlined,
    FileTextOutlined,
    SettingOutlined,
    RobotOutlined,
    HistoryOutlined,
    DownOutlined,
    RightOutlined,
    LoadingOutlined
} from '@ant-design/icons';
import { useState } from 'react';

interface SidebarProps {
    activeView: 'analysis' | 'report' | 'history';
    onViewChange: (view: 'analysis' | 'report' | 'history') => void;
    // New props for dynamic status
    messages: any[]; // Using any[] for simplicity, but ideally should match Message interface
    progressStatus: string;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, messages = [], progressStatus = '' }) => {
    const [isAgentsExpanded, setIsAgentsExpanded] = useState(true);

    // Config with internal keys for matching
    const agents = [
        { key: 'LithologyExpert', name: '岩性专家', abbr: 'L' },
        { key: 'ElectricalExpert', name: '电性专家', abbr: 'E' },
        { key: 'ReservoirPropertyExpert', name: '物性专家', abbr: 'R' },
        { key: 'SaturationExpert', name: '饱和度专家', abbr: 'S' },
        { key: 'MudLoggingExpert', name: '气测专家', abbr: 'G' },
        { key: 'MineralogyExpert', name: '矿物专家', abbr: 'M' },
        { key: 'Arbitrator', name: '仲裁者', abbr: 'A' },
    ];

    const getAgentStatus = (agent: typeof agents[0]) => {
        // 1. Check if currently processing (Active)
        // Check if progressStatus contains the name (e.g. "岩性专家正在分析...")
        if (progressStatus && progressStatus.includes(agent.name)) {
            return 'processing';
        }

        // 2. Check if has participated (Success)
        const hasMessage = messages.some(m => m.agent === agent.key);
        if (hasMessage) {
            return 'success';
        }

        return 'idle';
    };

    return (
        <div className="sidebar">
            {/* Logo */}
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">W</div>
                    <span className="sidebar-logo-text">Well Agent</span>
                </div>
            </div>

            {/* Navigation */}
            <nav style={{ padding: 'var(--spacing-md)', flex: 1, overflow: 'auto' }}>
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div className="card-title" style={{ marginBottom: 'var(--spacing-sm)' }}>
                        导航
                    </div>
                    <NavItem
                        icon={<DatabaseOutlined />}
                        label="数据导入"
                        active={false}
                    />
                    <NavItem
                        icon={<LineChartOutlined />}
                        label="智能解释"
                        active={activeView === 'analysis'}
                        onClick={() => onViewChange('analysis')}
                    />
                    <NavItem
                        icon={<HistoryOutlined />}
                        label="历史记录"
                        active={activeView === 'history'}
                        onClick={() => onViewChange('history')}
                    />
                    <NavItem
                        icon={<FileTextOutlined />}
                        label="生成报告"
                        active={activeView === 'report'}
                        onClick={() => onViewChange('report')}
                    />
                </div>

                {/* Agent Status */}
                <div>
                    <div
                        className="card-title"
                        style={{
                            marginBottom: 'var(--spacing-sm)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            userSelect: 'none'
                        }}
                        onClick={() => setIsAgentsExpanded(!isAgentsExpanded)}
                    >
                        <RobotOutlined style={{ marginRight: 6 }} />
                        <span style={{ flex: 1 }}>智能体状态</span>
                        {isAgentsExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                    </div>

                    {isAgentsExpanded && (
                        <div className="animate-fade-in" style={{ paddingLeft: 4 }}>
                            {agents.map((agent) => {
                                const status = getAgentStatus(agent);
                                return (
                                    <div key={agent.key} className="agent-status" style={{ marginBottom: 8 }}>
                                        <div
                                            className="chat-avatar"
                                            style={{
                                                width: 28,
                                                height: 28,
                                                fontSize: '0.7rem',
                                                // Grayscale if idle, Color if active/success
                                                filter: status === 'idle' ? 'grayscale(100%) opacity(0.5)' : 'none',
                                                transition: 'all 0.3s ease'
                                            }}
                                        >
                                            {agent.abbr}
                                        </div>
                                        <span style={{ flex: 1, fontSize: '0.85rem', color: status === 'idle' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                            {agent.name}
                                        </span>
                                        {status === 'processing' ? (
                                            <LoadingOutlined style={{ color: 'var(--accent-primary)' }} />
                                        ) : (
                                            <div className={`agent-status-dot ${status}`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </nav>

            {/* Footer */}
            <div style={{
                padding: 'var(--spacing-md)',
                borderTop: '1px solid var(--border-color)'
            }}>
                <NavItem icon={<SettingOutlined />} label="设置" active={false} />
            </div>
        </div>
    );
};

interface NavItemProps {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick }) => (
    <div
        onClick={onClick}
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            borderRadius: 8,
            cursor: 'pointer',
            marginBottom: 4,
            background: active ? 'var(--bg-elevated)' : 'transparent',
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            transition: 'all 0.2s ease',
        }}
    >
        <span style={{ fontSize: '1rem' }}>{icon}</span>
        <span style={{ fontSize: '0.9rem' }}>{label}</span>
    </div>
);

export default Sidebar;
