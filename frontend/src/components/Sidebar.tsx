import React from 'react';
import {
    DatabaseOutlined,
    LineChartOutlined,
    FileTextOutlined,
    SettingOutlined,
    RobotOutlined
} from '@ant-design/icons';

interface SidebarProps {
    activeView: 'analysis' | 'report';
    onViewChange: (view: 'analysis' | 'report') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange }) => {
    const agents = [
        { name: '岩性专家', status: 'idle' as const, abbr: 'L' },
        { name: '电性专家', status: 'idle' as const, abbr: 'E' },
        { name: '仲裁者', status: 'success' as const, abbr: 'A' },
    ];

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
            <nav style={{ padding: 'var(--spacing-md)', flex: 1 }}>
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
                        icon={<FileTextOutlined />}
                        label="生成报告"
                        active={activeView === 'report'}
                        onClick={() => onViewChange('report')}
                    />
                </div>

                {/* Agent Status */}
                <div>
                    <div className="card-title" style={{ marginBottom: 'var(--spacing-sm)' }}>
                        <RobotOutlined style={{ marginRight: 6 }} />
                        智能体状态
                    </div>
                    {agents.map((agent) => (
                        <div key={agent.name} className="agent-status" style={{ marginBottom: 8 }}>
                            <div
                                className="chat-avatar"
                                style={{ width: 28, height: 28, fontSize: '0.7rem' }}
                            >
                                {agent.abbr}
                            </div>
                            <span style={{ flex: 1, fontSize: '0.85rem' }}>{agent.name}</span>
                            <div className={`agent-status-dot ${agent.status}`} />
                        </div>
                    ))}
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
