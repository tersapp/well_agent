import React, { useEffect, useRef } from 'react';
import {
    DeleteOutlined,
    ArrowLeftOutlined,
    ArrowRightOutlined,
    BgColorsOutlined,
    FormatPainterOutlined
} from '@ant-design/icons';

interface TrackContextMenuProps {
    visible: boolean;
    x: number;
    y: number;
    trackName: string;
    isLithologyMode: boolean;
    canMoveLeft: boolean;
    canMoveRight: boolean;
    onClose: () => void;
    onDelete: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
    onToggleLithologyMode: () => void;
    onEditLithologyMap?: () => void; // New prop
}

const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
    visible,
    x,
    y,
    trackName,
    isLithologyMode,
    canMoveLeft,
    canMoveRight,
    onClose,
    onDelete,
    onMoveLeft,
    onMoveRight,
    onToggleLithologyMode,
    onEditLithologyMap
}) => {
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (visible) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [visible, onClose]);

    if (!visible) return null;

    const menuItemStyle: React.CSSProperties = {
        padding: '8px 16px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: '#e4e4e7',
        fontSize: '13px',
        transition: 'background-color 0.1s',
    };

    const handleMouseEnter = (e: React.MouseEvent) => {
        e.currentTarget.style.backgroundColor = '#3f3f46';
    };

    const handleMouseLeave = (e: React.MouseEvent) => {
        e.currentTarget.style.backgroundColor = 'transparent';
    };

    const disabledStyle = { color: '#52525b', cursor: 'not-allowed' };

    return (
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                top: y,
                left: x,
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                zIndex: 1000,
                minWidth: '160px',
                padding: '4px 0',
            }}
        >
            <div
                style={{
                    padding: '4px 16px 8px',
                    borderBottom: '1px solid #27272a',
                    marginBottom: '4px',
                    color: '#a1a1aa',
                    fontWeight: 600,
                    fontSize: '12px',
                }}
            >
                {trackName}
            </div>

            <div
                style={canMoveLeft ? menuItemStyle : { ...menuItemStyle, ...disabledStyle }}
                onClick={canMoveLeft ? () => { onMoveLeft(); onClose(); } : undefined}
                onMouseEnter={canMoveLeft ? handleMouseEnter : undefined}
                onMouseLeave={canMoveLeft ? handleMouseLeave : undefined}
            >
                <ArrowLeftOutlined /> 左移轨道
            </div>
            <div
                style={canMoveRight ? menuItemStyle : { ...menuItemStyle, ...disabledStyle }}
                onClick={canMoveRight ? () => { onMoveRight(); onClose(); } : undefined}
                onMouseEnter={canMoveRight ? handleMouseEnter : undefined}
                onMouseLeave={canMoveRight ? handleMouseLeave : undefined}
            >
                <ArrowRightOutlined /> 右移轨道
            </div>

            <div style={{ height: 1, backgroundColor: '#27272a', margin: '4px 0' }} />

            <div
                style={menuItemStyle}
                onClick={() => { onToggleLithologyMode(); onClose(); }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <BgColorsOutlined /> {isLithologyMode ? '切换为曲线模式' : '切换为岩性填充模式'}
            </div>

            {isLithologyMode && onEditLithologyMap && (
                <div
                    style={menuItemStyle}
                    onClick={() => { onEditLithologyMap(); onClose(); }}
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    <FormatPainterOutlined /> 岩性色标设置
                </div>
            )}

            <div style={{ height: 1, backgroundColor: '#27272a', margin: '4px 0' }} />

            <div
                style={{ ...menuItemStyle, color: '#ef4444' }}
                onClick={() => { onDelete(); onClose(); }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={handleMouseLeave}
            >
                <DeleteOutlined /> 隐藏轨道
            </div>
        </div>
    );
};

export default TrackContextMenu;
