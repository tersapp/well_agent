import React, { useState, useEffect } from 'react';
import { CheckCircleOutlined, StarOutlined, QuestionCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';

interface StandardType {
    description: string;
    unit: string;
}

interface CurveMapping {
    matched: Record<string, string>;
    unmatched: string[];
    curve_details: Record<string, { unit: string; description: string }>;
}

interface CurveMappingModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (mappings: Record<string, string>, shouldSave: boolean) => void;
    curveMapping: CurveMapping | null;
    standardTypes: Record<string, StandardType>;
    llmSuggestions?: Record<string, string | null>;
    isLoadingSuggestions?: boolean;
}

const CurveMappingModal: React.FC<CurveMappingModalProps> = ({
    visible,
    onClose,
    onConfirm,
    curveMapping,
    standardTypes,
    llmSuggestions = {},
    isLoadingSuggestions = false,
}) => {
    const [userMappings, setUserMappings] = useState<Record<string, string>>({});
    const [showMatched, setShowMatched] = useState(false);

    // Initialize mappings when modal opens
    useEffect(() => {
        if (visible && curveMapping) {
            const initial: Record<string, string> = { ...curveMapping.matched };
            // Apply LLM suggestions for unmatched
            curveMapping.unmatched.forEach(name => {
                if (llmSuggestions[name]) {
                    initial[name] = llmSuggestions[name] as string;
                }
            });
            setUserMappings(initial);
        }
    }, [visible, curveMapping, llmSuggestions]);

    // Common types for quick selection

    // Common types for quick selection
    const commonTypes = ['GR', 'RHOB', 'NPHI', 'RES_DEEP', 'DT', 'SP', 'CAL'];

    const handleMappingChange = (curveName: string, standardType: string) => {
        setUserMappings(prev => ({ ...prev, [curveName]: standardType }));
    };

    const handleAcceptAllSuggestions = () => {
        if (!curveMapping) return;
        const newMappings = { ...userMappings };
        curveMapping.unmatched.forEach(name => {
            if (llmSuggestions[name]) {
                newMappings[name] = llmSuggestions[name] as string;
            }
        });
        setUserMappings(newMappings);
    };

    const handleConfirm = (shouldSave: boolean) => {
        onConfirm(userMappings, shouldSave);
    };

    if (!visible || !curveMapping) return null;

    const unmatchedWithLLM = curveMapping.unmatched.filter(n => llmSuggestions[n]);
    // const unmatchedNoSuggestion = curveMapping.unmatched.filter(n => !llmSuggestions[n]);
    const matchedEntries = Object.entries(curveMapping.matched);

    const hasUnconfirmed = curveMapping.unmatched.some(name => !userMappings[name]);

    return (
        <div className="modal-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
        }}>
            <div className="modal-content" style={{
                backgroundColor: 'var(--bg-card)',
                borderRadius: 12,
                width: 700,
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid var(--border-color)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--border-color)',
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
                        曲线名称映射
                    </h2>
                    <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        检测到 {curveMapping.unmatched.length} 条未识别曲线，请确认映射关系
                    </p>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
                    {/* Pending Confirmation Section */}
                    {curveMapping.unmatched.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 12
                            }}>
                                <h3 style={{
                                    margin: 0,
                                    fontSize: '0.95rem',
                                    color: '#f59e0b',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8
                                }}>
                                    <StarOutlined /> 待确认项 ({curveMapping.unmatched.length})
                                </h3>
                                {unmatchedWithLLM.length > 0 && (
                                    <button
                                        onClick={handleAcceptAllSuggestions}
                                        style={{
                                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                            border: 'none',
                                            borderRadius: 6,
                                            padding: '6px 12px',
                                            color: 'white',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                        }}
                                    >
                                        <ThunderboltOutlined /> 接受所有建议
                                    </button>
                                )}
                            </div>

                            {isLoadingSuggestions && (
                                <div style={{
                                    padding: 16,
                                    textAlign: 'center',
                                    color: 'var(--text-secondary)'
                                }}>
                                    AI 正在分析曲线名称...
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {curveMapping.unmatched.map(name => {
                                    const hasLLM = !!llmSuggestions[name];
                                    const details = curveMapping.curve_details[name] || {};

                                    return (
                                        <div key={name} style={{
                                            display: 'grid',
                                            gridTemplateColumns: '140px 1fr 200px',
                                            gap: 12,
                                            alignItems: 'center',
                                            padding: '10px 12px',
                                            backgroundColor: hasLLM
                                                ? 'rgba(245, 158, 11, 0.1)'
                                                : 'rgba(239, 68, 68, 0.1)',
                                            borderRadius: 8,
                                            border: `1px solid ${hasLLM ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                        }}>
                                            <div style={{
                                                fontWeight: 600,
                                                color: hasLLM ? '#f59e0b' : '#ef4444',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}>
                                                {hasLLM ? <StarOutlined /> : <QuestionCircleOutlined />}
                                                {name}
                                            </div>
                                            <div style={{
                                                fontSize: '0.85rem',
                                                color: 'var(--text-secondary)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {details.description || details.unit || '-'}
                                            </div>
                                            <select
                                                value={userMappings[name] || ''}
                                                onChange={(e) => handleMappingChange(name, e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    backgroundColor: 'var(--bg-primary)',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: 6,
                                                    color: 'var(--text-primary)',
                                                    fontSize: '0.9rem',
                                                }}
                                            >
                                                <option value="">选择类型...</option>
                                                <optgroup label="常用">
                                                    {commonTypes.map(type => (
                                                        <option key={type} value={type}>
                                                            {type} - {standardTypes[type]?.description?.split(' - ')[0] || ''}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                                <optgroup label="全部">
                                                    {Object.entries(standardTypes).map(([key, info]) => (
                                                        <option key={key} value={key}>
                                                            {key} - {info.description.split(' - ')[0]}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Matched Section (Collapsible) */}
                    {matchedEntries.length > 0 && (
                        <div>
                            <button
                                onClick={() => setShowMatched(!showMatched)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontSize: '0.95rem',
                                    padding: 0,
                                    marginBottom: showMatched ? 12 : 0,
                                }}
                            >
                                <CheckCircleOutlined style={{ color: '#10b981' }} />
                                已自动匹配 ({matchedEntries.length})
                                <span style={{ fontSize: '0.8rem' }}>
                                    {showMatched ? '▼' : '▶'}
                                </span>
                            </button>

                            {showMatched && (
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 4,
                                    paddingLeft: 24,
                                }}>
                                    {matchedEntries.map(([original, standard]) => (
                                        <div key={original} style={{
                                            display: 'flex',
                                            gap: 8,
                                            fontSize: '0.85rem',
                                            color: 'var(--text-secondary)',
                                        }}>
                                            <span style={{ color: '#10b981' }}>✓</span>
                                            <span style={{ fontWeight: 500 }}>{original}</span>
                                            <span>→</span>
                                            <span>{standard}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {hasUnconfirmed ? '请为所有曲线选择映射类型' : '✓ 所有曲线已映射'}
                    </span>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: 'transparent',
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                            }}
                        >
                            跳过
                        </button>
                        <button
                            onClick={() => handleConfirm(false)}
                            disabled={hasUnconfirmed}
                            style={{
                                padding: '10px 20px',
                                backgroundColor: 'var(--accent-secondary)',
                                border: 'none',
                                borderRadius: 8,
                                color: 'white',
                                cursor: hasUnconfirmed ? 'not-allowed' : 'pointer',
                                opacity: hasUnconfirmed ? 0.5 : 1,
                            }}
                        >
                            仅本次使用
                        </button>
                        <button
                            onClick={() => handleConfirm(true)}
                            disabled={hasUnconfirmed}
                            style={{
                                padding: '10px 20px',
                                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                border: 'none',
                                borderRadius: 8,
                                color: 'white',
                                cursor: hasUnconfirmed ? 'not-allowed' : 'pointer',
                                opacity: hasUnconfirmed ? 0.5 : 1,
                                fontWeight: 500,
                            }}
                        >
                            确认并保存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CurveMappingModal;
