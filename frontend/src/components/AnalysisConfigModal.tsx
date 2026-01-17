import React, { useState, useEffect } from 'react';
import { CloseOutlined, AimOutlined } from '@ant-design/icons';

interface AnalysisConfigModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (config: AnalysisConfig) => void;
    depthRange: { min: number; max: number };
}

export interface AnalysisConfig {
    startDepth: number;
    endDepth: number;
    focusNote: string;
}

const AnalysisConfigModal: React.FC<AnalysisConfigModalProps> = ({
    visible,
    onClose,
    onConfirm,
    depthRange,
}) => {
    const [startDepth, setStartDepth] = useState(depthRange.min);
    const [endDepth, setEndDepth] = useState(depthRange.max);
    const [focusNote, setFocusNote] = useState('');

    useEffect(() => {
        setStartDepth(depthRange.min);
        setEndDepth(depthRange.max);
    }, [depthRange]);

    if (!visible) return null;

    const handleConfirm = () => {
        onConfirm({
            startDepth,
            endDepth,
            focusNote,
        });
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
        }}>
            <div
                className="card animate-fade-in"
                style={{
                    width: 420,
                    padding: 'var(--spacing-lg)',
                    background: 'var(--bg-secondary)',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--spacing-lg)',
                }}>
                    <h3 style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)',
                        margin: 0,
                    }}>
                        <AimOutlined style={{ color: 'var(--accent-primary)' }} />
                        分析配置
                    </h3>
                    <button
                        className="btn btn-ghost"
                        onClick={onClose}
                        style={{ padding: 8 }}
                    >
                        <CloseOutlined />
                    </button>
                </div>

                {/* Depth Range */}
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: 'var(--spacing-sm)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.85rem',
                    }}>
                        分析深度范围 (米)
                    </label>
                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                        <input
                            type="number"
                            value={startDepth}
                            onChange={(e) => setStartDepth(Number(e.target.value))}
                            style={{
                                flex: 1,
                                padding: 'var(--spacing-sm) var(--spacing-md)',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                color: 'var(--text-primary)',
                                fontSize: '0.9rem',
                            }}
                        />
                        <span style={{ color: 'var(--text-muted)' }}>至</span>
                        <input
                            type="number"
                            value={endDepth}
                            onChange={(e) => setEndDepth(Number(e.target.value))}
                            style={{
                                flex: 1,
                                padding: 'var(--spacing-sm) var(--spacing-md)',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                color: 'var(--text-primary)',
                                fontSize: '0.9rem',
                            }}
                        />
                    </div>
                    <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginTop: 'var(--spacing-xs)',
                    }}>
                        数据范围: {depthRange.min} - {depthRange.max} 米
                    </div>
                </div>

                {/* Focus Note */}
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: 'var(--spacing-sm)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.85rem',
                    }}>
                        分析重点（可选）
                    </label>
                    <textarea
                        value={focusNote}
                        onChange={(e) => setFocusNote(e.target.value)}
                        placeholder="例如：重点关注此层段是否为低阻油层，或判断油水界面位置..."
                        style={{
                            width: '100%',
                            height: 80,
                            padding: 'var(--spacing-sm) var(--spacing-md)',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem',
                            resize: 'none',
                        }}
                    />
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button
                        className="btn btn-ghost"
                        onClick={onClose}
                        style={{ flex: 1 }}
                    >
                        取消
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleConfirm}
                        style={{ flex: 1 }}
                    >
                        开始分析
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnalysisConfigModal;
