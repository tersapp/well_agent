import {
    FileTextOutlined,
    SettingOutlined,
    RobotOutlined,
    HistoryOutlined,
    DownOutlined,
    RightOutlined,
    LoadingOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    ExperimentOutlined,
    AuditOutlined,
    BulbOutlined
} from '@ant-design/icons';
import { useState } from 'react';

interface SidebarProps {
    activeView: 'analysis' | 'report' | 'history' | 'generation' | 'logs';
    onViewChange: (view: 'analysis' | 'report' | 'history' | 'generation' | 'logs') => void;
    // New props for dynamic status
    messages: any[]; // Using any[] for simplicity, but ideally should match Message interface
    progressStatus: string;
    collapsed: boolean;
    onToggleCollapse: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
    activeView,
    onViewChange,
    messages = [],
    progressStatus = '',
    collapsed,
    onToggleCollapse
}) => {
    const [isScenariosExpanded, setIsScenariosExpanded] = useState(true);
    const [isAnalysisExpanded, setIsAnalysisExpanded] = useState(true);
    const [isAgentsExpanded, setIsAgentsExpanded] = useState(true);

    // Config with internal keys for matching
    const agents = [
        { key: 'LithologyExpert', name: '岩性专家', abbr: 'L' },
        { key: 'ElectricalExpert', name: '电性专家', abbr: 'E' },
        { key: 'ReservoirPropertyExpert', name: '物性专家', abbr: 'R' },
        { key: 'SaturationExpert', name: '饱和度专家', abbr: 'S' },
        { key: 'MudLoggingExpert', name: '气测专家', abbr: 'G' },
        { key: 'MineralogyExpert', name: '矿物专家', abbr: 'M' },
        { key: 'Arbitrator', name: '决策者', abbr: 'A' },
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
        <div className={`sidebar ${collapsed ? 'collapsed' : ''}`} style={{ width: collapsed ? 64 : 280 }}>
            {/* Logo */}
            <div className="sidebar-header" style={{
                padding: collapsed ? 'var(--spacing-md) var(--spacing-xs)' : 'var(--spacing-lg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'space-between'
            }}>
                {!collapsed && (
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon">W</div>
                        <span className="sidebar-logo-text">Well Agent</span>
                    </div>
                )}
                {collapsed && <div className="sidebar-logo-icon" style={{ cursor: 'pointer' }} onClick={onToggleCollapse}>W</div>}
                {!collapsed && (
                    <div
                        onClick={onToggleCollapse}
                        style={{
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            fontSize: '1.2rem',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <MenuFoldOutlined />
                    </div>
                )}
            </div>

            {collapsed && (
                <div
                    onClick={onToggleCollapse}
                    style={{
                        padding: 'var(--spacing-md) 0',
                        textAlign: 'center',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        fontSize: '1.2rem',
                        borderBottom: '1px solid var(--border-color)'
                    }}
                >
                    <MenuUnfoldOutlined />
                </div>
            )}

            {/* Navigation */}
            <nav style={{ padding: 'var(--spacing-md)', flex: 1, overflow: 'auto' }}>
                {/* Section: Intelligent Scenarios */}
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    {!collapsed && (
                        <div
                            className="card-title"
                            style={{
                                marginBottom: 'var(--spacing-sm)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                userSelect: 'none'
                            }}
                            onClick={() => setIsScenariosExpanded(!isScenariosExpanded)}
                        >
                            <span style={{ flex: 1 }}>智能场景</span>
                            {isScenariosExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                        </div>
                    )}
                    {(!collapsed ? isScenariosExpanded : true) && (
                        <>
                            <NavItem
                                icon={<BulbOutlined />}
                                label="智能解释"
                                active={activeView === 'analysis'}
                                onClick={() => onViewChange('analysis')}
                                collapsed={collapsed}
                            />
                            <NavItem
                                icon={<ExperimentOutlined />}
                                label="智能生成"
                                active={activeView === 'generation'}
                                onClick={() => onViewChange('generation')}
                                collapsed={collapsed}
                            />
                            <NavItem
                                icon={<FileTextOutlined />}
                                label="报告生成"
                                active={activeView === 'report'}
                                onClick={() => onViewChange('report')}
                                collapsed={collapsed}
                            />
                        </>
                    )}
                </div>

                {/* Section: Retrospective Analysis */}
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    {!collapsed && (
                        <div
                            className="card-title"
                            style={{
                                marginBottom: 'var(--spacing-sm)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                userSelect: 'none'
                            }}
                            onClick={() => setIsAnalysisExpanded(!isAnalysisExpanded)}
                        >
                            <span style={{ flex: 1 }}>回溯分析</span>
                            {isAnalysisExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                        </div>
                    )}
                    {(!collapsed ? isAnalysisExpanded : true) && (
                        <>
                            <NavItem
                                icon={<HistoryOutlined />}
                                label="历史记录"
                                active={activeView === 'history'}
                                onClick={() => onViewChange('history')}
                                collapsed={collapsed}
                            />
                            <NavItem
                                icon={<AuditOutlined />}
                                label="操作日志"
                                active={activeView === 'logs'}
                                onClick={() => onViewChange('logs')}
                                collapsed={collapsed}
                            />
                        </>
                    )}
                </div>

                {/* Agent Status */}
                <div>
                    {!collapsed && (
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
                    )}

                    {isAgentsExpanded && (
                        <div className="animate-fade-in" style={{ paddingLeft: collapsed ? 0 : 4 }}>
                            {agents.map((agent) => {
                                const status = getAgentStatus(agent);
                                return (
                                    <div
                                        key={agent.key}
                                        className="agent-status"
                                        style={{
                                            marginBottom: 8,
                                            padding: collapsed ? '4px' : 'var(--spacing-sm) var(--spacing-md)',
                                            justifyContent: collapsed ? 'center' : 'flex-start'
                                        }}
                                        title={collapsed ? agent.name : undefined}
                                    >
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
                                        {!collapsed && (
                                            <>
                                                <span style={{ flex: 1, fontSize: '0.85rem', color: status === 'idle' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                                    {agent.name}
                                                </span>
                                                {status === 'processing' ? (
                                                    <LoadingOutlined style={{ color: 'var(--accent-primary)' }} />
                                                ) : (
                                                    <div className={`agent-status-dot ${status}`} />
                                                )}
                                            </>
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
                padding: collapsed ? 'var(--spacing-xs)' : 'var(--spacing-md)',
                borderTop: '1px solid var(--border-color)'
            }}>
                <NavItem icon={<SettingOutlined />} label="设置" active={false} collapsed={collapsed} />
            </div>
        </div>
    );
};

interface NavItemProps {
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick?: () => void;
    collapsed?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick, collapsed }) => (
    <div
        onClick={onClick}
        title={collapsed ? label : undefined}
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : 'var(--spacing-sm)',
            padding: collapsed ? 'var(--spacing-sm) 0' : 'var(--spacing-sm) var(--spacing-md)',
            borderRadius: 8,
            cursor: 'pointer',
            marginBottom: 4,
            background: active ? 'var(--bg-elevated)' : 'transparent',
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            transition: 'all 0.2s ease',
        }}
    >
        <span style={{ fontSize: '1.1rem' }}>{icon}</span>
        {!collapsed && <span style={{ fontSize: '0.9rem' }}>{label}</span>}
    </div>
);

export default Sidebar;
