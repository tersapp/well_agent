import React, { useState, useEffect, useRef } from 'react';
import { SendOutlined, CloseOutlined } from '@ant-design/icons';

interface AnalysisPopupProps {
    visible: boolean;
    x: number;
    y: number;
    depthRange: [number, number]; // [start, end]. If start === end, it's a point.
    onConfirm: (note: string) => void;
    onCancel: () => void;
}

const AnalysisPopup: React.FC<AnalysisPopupProps> = ({
    visible,
    x,
    y,
    depthRange,
    onConfirm,
    onCancel
}) => {
    const [note, setNote] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (visible) {
            // Calculate position to keep it within viewport
            // Basic logic: prefer bottom-right of cursor, flip if too close to edge
            const width = 300;
            const height = 200;
            // padding removed

            let top = y + 10;
            let left = x + 10;

            if (left + width > window.innerWidth) {
                left = x - width - 10;
            }
            if (top + height > window.innerHeight) {
                top = y - height - 10;
            }

            setPosition({ top, left });

            // Focus input
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        } else {
            setNote(''); // Reset note on close
        }
    }, [visible, x, y]);

    if (!visible) return null;

    const isPoint = Math.abs(depthRange[1] - depthRange[0]) < 0.01;
    const title = isPoint
        ? `深度点分析: ${depthRange[0].toFixed(2)} m`
        : `深度段分析: ${depthRange[0].toFixed(2)} - ${depthRange[1].toFixed(2)} m`;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onConfirm(note);
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            width: 300,
            backgroundColor: '#1f2937', // dark-gray-800
            border: '1px solid #374151', // dark-gray-700
            borderRadius: 8,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.1s ease-out'
        }}>
            {/* Header */}
            <div style={{
                padding: '8px 12px',
                borderBottom: '1px solid #374151',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#111827' // dark-gray-900
            }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>
                    {title}
                </span>
                <div
                    onClick={onCancel}
                    style={{ cursor: 'pointer', color: '#9ca3af', padding: 2 }}
                >
                    <CloseOutlined style={{ fontSize: 12 }} />
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: 12 }}>
                <textarea
                    ref={inputRef}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="请输入分析指令或问题... (Enter 发送)"
                    style={{
                        width: '100%',
                        height: 80,
                        backgroundColor: '#374151',
                        border: '1px solid #4b5563',
                        borderRadius: 4,
                        padding: 8,
                        color: 'white',
                        fontSize: 13,
                        resize: 'none',
                        outline: 'none',
                        marginBottom: 10
                    }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                        onClick={onCancel}
                        className="btn-ghost"
                        style={{ fontSize: 12, padding: '4px 8px' }}
                    >
                        取消
                    </button>
                    <button
                        onClick={() => onConfirm(note)}
                        className="btn-primary"
                        style={{
                            fontSize: 12,
                            padding: '4px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                        }}
                    >
                        <span>开始分析</span>
                        <SendOutlined />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AnalysisPopup;
