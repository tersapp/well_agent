import React, { useState, useEffect } from 'react';

interface DepthRangeModalProps {
    visible: boolean;
    currentStart: number;
    currentEnd: number;
    minLimit: number; // File start
    maxLimit: number; // File end
    onClose: () => void;
    onConfirm: (start: number, end: number) => void;
}

const DepthRangeModal: React.FC<DepthRangeModalProps> = ({
    visible,
    currentStart,
    currentEnd,
    minLimit,
    maxLimit,
    onClose,
    onConfirm,
}) => {
    const [start, setStart] = useState<string>('');
    const [end, setEnd] = useState<string>('');

    useEffect(() => {
        if (visible) {
            setStart(currentStart.toFixed(2));
            setEnd(currentEnd.toFixed(2));
        }
    }, [visible, currentStart, currentEnd]);

    if (!visible) return null;

    const handleConfirm = () => {
        const s = parseFloat(start);
        const e = parseFloat(end);

        if (isNaN(s) || isNaN(e)) return;
        if (s >= e) {
            alert('起始深度必须小于结束深度');
            return;
        }

        // Clamp to limits if desired, or allow zoom out?
        // Usually local zoom allows staying within limits.
        // Let's just pass values.
        onConfirm(s, e);
        onClose();
    };

    return (
        <>
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.6)',
                    zIndex: 1000,
                }}
                onClick={onClose}
            />
            <div
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #3f3f46',
                    borderRadius: 12,
                    padding: 24,
                    width: 320,
                    zIndex: 1001,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm();
                    if (e.key === 'Escape') onClose();
                }}
            >
                <h3 style={{ margin: '0 0 16px', color: '#e4e4e7', fontSize: 16 }}>调整深度显示范围</h3>

                <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', marginBottom: 8, color: '#a1a1aa', fontSize: 12 }}>
                        起始深度 (m) [最小: {minLimit.toFixed(2)}]
                    </label>
                    <input
                        type="number"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: '#0f0f1a',
                            border: '1px solid #3f3f46',
                            borderRadius: 6,
                            color: '#e4e4e7',
                            fontSize: 14,
                            outline: 'none',
                        }}
                        onFocus={(e) => e.target.select()}
                        step={0.1}
                    />
                </div>

                <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', marginBottom: 8, color: '#a1a1aa', fontSize: 12 }}>
                        结束深度 (m) [最大: {maxLimit.toFixed(2)}]
                    </label>
                    <input
                        type="number"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: '#0f0f1a',
                            border: '1px solid #3f3f46',
                            borderRadius: 6,
                            color: '#e4e4e7',
                            fontSize: 14,
                            outline: 'none',
                        }}
                        onFocus={(e) => e.target.select()}
                        step={0.1}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: 'transparent',
                            border: '1px solid #3f3f46',
                            borderRadius: 6,
                            color: '#e4e4e7',
                            cursor: 'pointer',
                        }}
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        style={{
                            padding: '8px 16px',
                            background: 'linear-gradient(135deg, #c084fc 0%, #818cf8 100%)',
                            border: 'none',
                            borderRadius: 6,
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 500,
                        }}
                    >
                        确定
                    </button>
                </div>
            </div>
        </>
    );
};

export default DepthRangeModal;
