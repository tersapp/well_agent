import React, { useState, useEffect } from 'react';
import { CloseOutlined, LineChartOutlined } from '@ant-design/icons';

interface ScaleEditModalProps {
    visible: boolean;
    trackName: string;
    currentMin: number;
    currentMax: number;
    unit: string;
    onClose: () => void;
    onConfirm: (min: number, max: number) => void;
}

const ScaleEditModal: React.FC<ScaleEditModalProps> = ({
    visible,
    trackName,
    currentMin,
    currentMax,
    unit,
    onClose,
    onConfirm,
}) => {
    const [min, setMin] = useState(currentMin);
    const [max, setMax] = useState(currentMax);

    useEffect(() => {
        setMin(currentMin);
        setMax(currentMax);
    }, [currentMin, currentMax, visible]);

    if (!visible) return null;

    const handleConfirm = () => {
        onConfirm(min, max);
        onClose();
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
                    width: 360,
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
                        gap: 8,
                        margin: 0,
                        fontSize: 16,
                    }}>
                        <LineChartOutlined style={{ color: 'var(--accent-primary)' }} />
                        编辑刻度范围
                    </h3>
                    <button
                        className="btn btn-ghost"
                        onClick={onClose}
                        style={{ padding: 8 }}
                    >
                        <CloseOutlined />
                    </button>
                </div>

                {/* Track Info */}
                <div style={{
                    padding: '8px 12px',
                    background: 'var(--bg-card)',
                    borderRadius: 8,
                    marginBottom: 'var(--spacing-md)',
                    fontSize: 14,
                }}>
                    曲线: <strong style={{ color: 'var(--accent-primary)' }}>{trackName}</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>({unit})</span>
                </div>

                {/* Min/Max Inputs */}
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{
                            display: 'block',
                            marginBottom: 4,
                            fontSize: 12,
                            color: 'var(--text-secondary)'
                        }}>
                            最小值
                        </label>
                        <input
                            type="number"
                            value={min}
                            onChange={(e) => setMin(Number(e.target.value))}
                            step="any"
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                color: 'var(--text-primary)',
                                fontSize: 14,
                            }}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{
                            display: 'block',
                            marginBottom: 4,
                            fontSize: 12,
                            color: 'var(--text-secondary)'
                        }}>
                            最大值
                        </label>
                        <input
                            type="number"
                            value={max}
                            onChange={(e) => setMax(Number(e.target.value))}
                            step="any"
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                color: 'var(--text-primary)',
                                fontSize: 14,
                            }}
                        />
                    </div>
                </div>

                {/* Preset Buttons */}
                <div style={{
                    display: 'flex',
                    gap: 8,
                    marginBottom: 'var(--spacing-lg)',
                    flexWrap: 'wrap',
                }}>
                    <button
                        className="btn btn-ghost"
                        onClick={() => { setMin(0); setMax(150); }}
                        style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                        GR标准
                    </button>
                    <button
                        className="btn btn-ghost"
                        onClick={() => { setMin(0.2); setMax(2000); }}
                        style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                        电阻率
                    </button>
                    <button
                        className="btn btn-ghost"
                        onClick={() => { setMin(1.95); setMax(2.95); }}
                        style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                        密度
                    </button>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>
                        取消
                    </button>
                    <button className="btn btn-primary" onClick={handleConfirm} style={{ flex: 1 }}>
                        确定
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScaleEditModal;
