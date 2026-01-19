import React, { useState, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import TrackColumn from './TrackColumn';
import DepthColumn from './DepthColumn';
import TrackContextMenu from './TrackContextMenu';
import ScaleEditModal from './ScaleEditModal';
import DepthRangeModal from './DepthRangeModal';
import LithologyConfigModal from './LithologyConfigModal';
import AnalysisPopup from './AnalysisPopup';
import { FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';

interface LogChartProps {
    depth: number[];
    curves: Record<string, (number | null)[]>;
    highlightRange?: { start: number; end: number };
    isFullscreen?: boolean;
    onToggleFullscreen?: () => void;
    onAnalysisRequest?: (start: number, end: number, note: string) => void;
}

export interface LogChartRef {
    getSessionState: () => {
        trackOrder: string[];
        hiddenTracks: string[];
        customScales: Record<string, { min: number; max: number }>;
        lithologyModeTracks: string[];
        lithologyConfigs: Record<string, Record<number, { color: string, label: string }>>; // Add this
        viewRange: [number, number];
    };
    restoreSessionState: (state: {
        trackOrder: string[];
        hiddenTracks: string[];
        customScales: Record<string, { min: number; max: number }>;
        lithologyModeTracks: string[];
        lithologyConfigs?: Record<string, Record<number, { color: string, label: string }>>; // Add this
        viewRange: [number, number];
    }) => void;
}

// Professional track configuration
const defaultTrackConfig: Record<string, { color: string; fillColor?: string; min: number; max: number; log?: boolean; unit: string }> = {
    GR: { color: '#2ecc71', fillColor: 'rgba(46, 204, 113, 0.25)', min: 0, max: 150, unit: 'API' },
    SGR: { color: '#27ae60', min: 0, max: 150, unit: 'API' },
    SP: { color: '#9b59b6', min: -150, max: 50, unit: 'mV' },
    CAL: { color: '#34495e', min: 5, max: 15, unit: 'in' },
    CALI: { color: '#34495e', min: 5, max: 15, unit: 'in' },
    RT: { color: '#e74c3c', min: 0.2, max: 2000, log: true, unit: 'Ω·m' },
    RD: { color: '#e74c3c', min: 0.2, max: 2000, log: true, unit: 'Ω·m' },
    RS: { color: '#f39c12', min: 0.2, max: 2000, log: true, unit: 'Ω·m' },
    RHOB: { color: '#e74c3c', min: 1.95, max: 2.95, unit: 'g/cc' },
    DEN: { color: '#e74c3c', min: 1.95, max: 2.95, unit: 'g/cc' },
    NPHI: { color: '#3498db', min: 0.45, max: -0.15, unit: 'v/v' },
    CNL: { color: '#3498db', min: 0.45, max: -0.15, unit: 'v/v' },
    DT: { color: '#1abc9c', min: 140, max: 40, unit: 'μs/ft' },
    AC: { color: '#1abc9c', min: 140, max: 40, unit: 'μs/ft' },
    PE: { color: '#8e44ad', min: 0, max: 10, unit: 'b/e' },
    // Seismic & Rock Physics
    TIME: { color: '#95a5a6', min: 0, max: 1000, unit: 'ms' },
    VPVS: { color: '#e67e22', min: 1.5, max: 3.0, unit: '' },
    AI: { color: '#34495e', min: 0, max: 20000, unit: 'kPa·s/m' },
    SEIS: { color: '#7f8c8d', min: -1, max: 1, unit: '' },
    // Lithology
    LITH: { color: '#f1c40f', min: 0, max: 5, unit: '' },
    LITH1: { color: '#f1c40f', min: 0, max: 5, unit: '' },
    LITH2: { color: '#f1c40f', min: 0, max: 5, unit: '' },
    LITH3: { color: '#f1c40f', min: 0, max: 5, unit: '' },
    LITH4: { color: '#f1c40f', min: 0, max: 5, unit: '' },
};

const getDefaultConfig = (name: string) => {
    const upper = name.toUpperCase();
    return defaultTrackConfig[upper] || null;
};

const TRACK_WIDTH = 150;
const DEPTH_TRACK_WIDTH = 80;

const LogChart = forwardRef<LogChartRef, LogChartProps>(({
    depth,
    curves,
    isFullscreen = false,
    onToggleFullscreen,
    onAnalysisRequest,
}, ref) => {

    const [trackOrder, setTrackOrder] = useState<string[]>([]);
    const [hiddenTracks, setHiddenTracks] = useState<Set<string>>(new Set());
    const [customScales, setCustomScales] = useState<Record<string, { min: number; max: number }>>({});
    const [lithologyModeTracks, setLithologyModeTracks] = useState<Set<string>>(new Set());

    const [isAltKeyPressed, setIsAltKeyPressed] = useState(false);
    const [selectionStart, setSelectionStart] = useState<{ y: number; depth: number } | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<{ y: number; depth: number } | null>(null);
    const [popupState, setPopupState] = useState<{ visible: boolean; x: number; y: number; depthRange: [number, number] }>({
        visible: false, x: 0, y: 0, depthRange: [0, 0]
    });

    // Alt Key Detection
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Alt') setIsAltKeyPressed(true);
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Alt') {
                setIsAltKeyPressed(false);
                setSelectionStart(null); // Cancel selection if Alt is released
                setSelectionEnd(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Lithology Configs: TrackName -> { Value -> { Color, Label } }
    const [lithologyConfigs, setLithologyConfigs] = useState<Record<string, Record<number, { color: string, label: string }>>>({});

    // View Depth State
    const validDepths = useMemo(() => depth.filter(d => d !== null && !isNaN(d)), [depth]);
    const minDepth = Math.min(...validDepths);
    const maxDepth = Math.max(...validDepths);

    const [viewDepth, setViewDepth] = useState<[number, number] | undefined>(undefined);
    const [currentRange, setCurrentRange] = useState<[number, number]>([minDepth, maxDepth]);

    // Crosshair State
    const containerRef = useRef<HTMLDivElement>(null);
    const [cursorState, setCursorState] = useState<{ x: number; y: number; depth: number } | null>(null);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Helper: Get curve value at a specific depth (with linear interpolation)
    const getCurveValueAtDepth = useCallback((curveName: string, targetDepth: number): number | null => {
        const curveData = curves[curveName];
        if (!curveData || curveData.length === 0) return null;

        // Find the two depth points that bracket the target depth
        for (let i = 0; i < depth.length - 1; i++) {
            const d1 = depth[i];
            const d2 = depth[i + 1];
            if (d1 === null || d2 === null) continue;

            if ((d1 <= targetDepth && targetDepth <= d2) || (d2 <= targetDepth && targetDepth <= d1)) {
                const v1 = curveData[i];
                const v2 = curveData[i + 1];
                if (v1 === null || v2 === null) return null;

                // Linear interpolation
                const fraction = (targetDepth - d1) / (d2 - d1);
                return v1 + fraction * (v2 - v1);
            }
        }
        return null;
    }, [curves, depth]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const x = e.clientX - rect.left;
        const h = rect.height;

        // Update scroll position
        setScrollLeft(containerRef.current.scrollLeft);

        // TrackColumn Layout Constants
        const HEADER_HEIGHT = 24;
        const GRID_TOP = 55;
        const GRID_BOTTOM = 30;

        const plotTop = HEADER_HEIGHT + GRID_TOP;
        const plotBottom = h - GRID_BOTTOM;
        const plotHeight = plotBottom - plotTop;

        if (plotHeight > 0 && y >= plotTop && y <= plotBottom) {
            const fraction = (y - plotTop) / plotHeight;
            const rangeStart = viewDepth ? viewDepth[0] : minDepth;
            const rangeEnd = viewDepth ? viewDepth[1] : maxDepth;

            const depth = rangeStart + fraction * (rangeEnd - rangeStart);

            // Always show cursor state (crosshair)
            setCursorState({ x, y, depth });

            // Only update selection if Alt is pressed
            if (isAltKeyPressed && selectionStart) {
                setSelectionEnd({ y, depth });
            }
        } else {
            setCursorState(null);
        }
    }, [viewDepth, minDepth, maxDepth, isAltKeyPressed, selectionStart]);

    const handleMouseLeave = useCallback(() => {
        setCursorState(null);
        if (selectionStart) {
            setSelectionStart(null);
            setSelectionEnd(null);
        }
    }, [selectionStart]);

    const handleMouseDown = useCallback(() => {
        if (!isAltKeyPressed || !cursorState) return;
        // Start selection
        setSelectionStart({ y: cursorState.y, depth: cursorState.depth });
        setSelectionEnd({ y: cursorState.y, depth: cursorState.depth });
        setPopupState(prev => ({ ...prev, visible: false })); // Hide popup if open
    }, [isAltKeyPressed, cursorState]);

    const handleMouseUp = useCallback(() => {
        if (!isAltKeyPressed || !selectionStart || !selectionEnd) {
            // If Alt is pressed but no drag, it might be a click (point inspection)
            if (isAltKeyPressed && cursorState && !selectionStart) {
                setPopupState({
                    visible: true,
                    x: cursorState.x, // Adjusted to use cursorState.x for popup positioning if needed, or keep previous logic
                    y: cursorState.y,
                    depthRange: [cursorState.depth, cursorState.depth]
                });
            }
            setSelectionStart(null);
            setSelectionEnd(null);
            return;
        }

        // Finalize selection
        const d1 = selectionStart.depth;
        const d2 = selectionEnd.depth;
        const start = Math.min(d1, d2);
        const end = Math.max(d1, d2);

        // If range is very small, treat as point
        if (Math.abs(end - start) < 0.05) {
            setPopupState({
                visible: true,
                x: cursorState?.x ?? 0,
                y: cursorState?.y ?? 0,
                depthRange: [start, start]
            });
        } else {
            setPopupState({
                visible: true,
                x: cursorState?.x ?? 0,
                y: cursorState?.y ?? 0,
                depthRange: [start, end]
            });
        }

        // Don't clear selection immediately so user can see what they selected? 
        // Or clear it and show popup. Let's clear for now as the popup shows the range.
        setSelectionStart(null);
        setSelectionEnd(null);

    }, [isAltKeyPressed, selectionStart, selectionEnd, cursorState]);


    const handleAnalysisConfirm = (note: string) => {
        if (onAnalysisRequest) {
            onAnalysisRequest(popupState.depthRange[0], popupState.depthRange[1], note);
        }
        setPopupState(prev => ({ ...prev, visible: false }));
    };

    // Handle view change from graph scroll
    const handleViewDepthChange = useCallback((start: number, end: number) => {
        setViewDepth([start, end]);
        setCurrentRange([start, end]);
    }, []);

    // Dynamic scale logic
    const dynamicConfigs = useMemo(() => {
        const configs: Record<string, any> = {};
        Object.keys(curves).forEach(name => {
            if (defaultTrackConfig[name.toUpperCase()]) return;
            const vals = curves[name].filter(v => v !== null && !isNaN(v)) as number[];
            if (vals.length === 0) {
                configs[name] = { min: 0, max: 100, unit: '' };
                return;
            }
            vals.sort((a, b) => a - b);
            const p01 = vals[Math.floor(vals.length * 0.01)];
            const p99 = vals[Math.floor(vals.length * 0.99)];
            let min = p01;
            let max = p99;
            if (max === min) { max += 1; min -= 1; }
            else { const range = max - min; max += range * 0.05; min -= range * 0.05; }
            const hash = name.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
            const color = `hsl(${Math.abs(hash) % 360}, 60%, 50%)`;
            configs[name] = { color: color, min: Number(min.toPrecision(3)), max: Number(max.toPrecision(3)), unit: '' };
        });
        return configs;
    }, [curves]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
        getSessionState: () => ({
            trackOrder,
            hiddenTracks: Array.from(hiddenTracks),
            customScales,
            lithologyModeTracks: Array.from(lithologyModeTracks),
            lithologyConfigs, // Save this
            viewRange: currentRange,
        }),
        restoreSessionState: (state) => {
            if (state.trackOrder) setTrackOrder(state.trackOrder);
            if (state.hiddenTracks) setHiddenTracks(new Set(state.hiddenTracks));
            if (state.customScales) setCustomScales(state.customScales);
            if (state.lithologyModeTracks) setLithologyModeTracks(new Set(state.lithologyModeTracks));
            if (state.lithologyConfigs) setLithologyConfigs(state.lithologyConfigs); // Restore this
            if (state.viewRange) {
                setViewDepth(state.viewRange);
                setCurrentRange(state.viewRange);
            }
        }
    }));

    // Modals
    const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; trackName: string }>({
        visible: false, x: 0, y: 0, trackName: ''
    });
    const [scaleModal, setScaleModal] = useState<{ visible: boolean; trackName: string; min: number; max: number }>({
        visible: false, trackName: '', min: 0, max: 100
    });
    const [depthModal, setDepthModal] = useState<{ visible: boolean }>({
        visible: false
    });
    // Lithology Config Modal State
    const [lithConfigModal, setLithConfigModal] = useState<{ visible: boolean; trackName: string; values: number[] }>({
        visible: false, trackName: '', values: []
    });

    const availableTracks = useMemo(() => {
        const curveNames = Object.keys(curves).filter(k => k.toUpperCase() !== 'DEPTH' && k.toUpperCase() !== 'DEPT');
        if (trackOrder.length === 0 && curveNames.length > 0) { setTrackOrder(curveNames); return curveNames; }
        const existing = trackOrder.filter(t => curveNames.includes(t));
        const newTracks = curveNames.filter(t => !trackOrder.includes(t));
        return [...existing, ...newTracks];
    }, [curves, trackOrder]);

    const visibleTracks = useMemo(() => availableTracks.filter(t => !hiddenTracks.has(t)), [availableTracks, hiddenTracks]);

    // Handlers
    const handleContextMenu = useCallback((e: React.MouseEvent, trackName: string) => {
        setContextMenu({ visible: true, x: e.clientX, y: e.clientY, trackName });
    }, []);

    const handleDeleteTrack = useCallback(() => {
        setHiddenTracks(prev => new Set([...prev, contextMenu.trackName]));
    }, [contextMenu.trackName]);

    const handleMoveTrack = useCallback((direction: 'left' | 'right') => {
        const idx = visibleTracks.indexOf(contextMenu.trackName);
        if (idx === -1) return;
        const newOrder = [...visibleTracks];
        const targetIdx = direction === 'left' ? idx - 1 : idx + 1;
        if (targetIdx >= 0 && targetIdx < newOrder.length) {
            [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
            setTrackOrder(newOrder);
        }
    }, [visibleTracks, contextMenu.trackName]);

    const handleToggleLithologyMode = useCallback(() => {
        const trackName = contextMenu.trackName;
        setLithologyModeTracks(prev => {
            const newSet = new Set(prev);
            if (newSet.has(trackName)) newSet.delete(trackName);
            else newSet.add(trackName);
            return newSet;
        });
    }, [contextMenu.trackName]);

    // Open Lithology Config Modal
    const handleEditLithologyMap = useCallback(() => {
        const trackName = contextMenu.trackName;
        const trackData = curves[trackName] || [];
        // Scan for distinct integer values
        const distinctValues = Array.from(new Set(
            trackData
                .filter(v => v !== null && !isNaN(v))
                .map(v => Math.round(v!))
        )).sort((a, b) => a - b);

        setLithConfigModal({
            visible: true,
            trackName,
            values: distinctValues
        });
    }, [contextMenu.trackName, curves]);

    const handleSaveLithologyMap = useCallback((trackName: string, config: Record<number, { color: string, label: string }>) => {
        setLithologyConfigs(prev => ({
            ...prev,
            [trackName]: config
        }));
        setLithConfigModal(prev => ({ ...prev, visible: false }));
    }, []);


    const handleDoubleClickScale = useCallback((trackName: string, currentMin: number, currentMax: number) => {
        const custom = customScales[trackName.toUpperCase()];
        const dynamic = dynamicConfigs[trackName] || { min: 0, max: 100 };
        const base = getDefaultConfig(trackName) || dynamic;
        setScaleModal({
            visible: true,
            trackName,
            min: custom?.min ?? currentMin ?? base.min,
            max: custom?.max ?? currentMax ?? base.max,
        });
    }, [customScales, dynamicConfigs]);

    const handleScaleConfirm = useCallback((min: number, max: number) => {
        setCustomScales(prev => ({ ...prev, [scaleModal.trackName.toUpperCase()]: { min, max } }));
    }, [scaleModal.trackName]);

    const handleDepthConfirm = useCallback((start: number, end: number) => {
        setViewDepth([start, end]);
        setCurrentRange([start, end]);
    }, []);

    const [draggedTrack, setDraggedTrack] = useState<string | null>(null);
    const handleDragStart = useCallback((e: React.DragEvent, trackName: string) => {
        if (isAltKeyPressed) {
            e.preventDefault();
            return;
        }
        setDraggedTrack(trackName);
        e.dataTransfer.effectAllowed = 'move';
    }, [isAltKeyPressed]);
    const handleDrop = useCallback((e: React.DragEvent, targetTrackName: string) => {
        e.preventDefault(); if (!draggedTrack || draggedTrack === targetTrackName) return;
        const newOrder = [...visibleTracks]; const fromIdx = newOrder.indexOf(draggedTrack); const toIdx = newOrder.indexOf(targetTrackName);
        if (fromIdx !== -1 && toIdx !== -1) { newOrder.splice(fromIdx, 1); newOrder.splice(toIdx, 0, draggedTrack); setTrackOrder(newOrder); }
        setDraggedTrack(null);
    }, [draggedTrack, visibleTracks]);

    const getTrackConfig = useCallback((name: string) => {
        const base = getDefaultConfig(name) || dynamicConfigs[name] || { color: '#888888', min: 0, max: 100, unit: '', log: false };
        const custom = customScales[name.toUpperCase()];
        const isLith = lithologyModeTracks.has(name) || name.toUpperCase().includes('LITH');
        const config = custom ? { ...base, ...custom } : base;
        if (isLith) return { ...config, type: 'lithology' as const };
        return config;
    }, [customScales, lithologyModeTracks, dynamicConfigs]);

    if (!depth || depth.length === 0) return <div style={{ color: '#71717a', padding: 20 }}>暂无数据</div>;

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #3f3f46', backgroundColor: '#1a1a2e' }}>
                <div style={{ fontSize: 12, color: '#a1a1aa' }}>
                    深度范围: <span style={{ color: '#e4e4e7', fontWeight: 'bold' }}>{currentRange[0].toFixed(1)} - {currentRange[1].toFixed(1)} m</span> | 显示 {visibleTracks.length}/{availableTracks.length} 条曲线
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {hiddenTracks.size > 0 && <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setHiddenTracks(new Set())}>显示全部 ({hiddenTracks.size} 隐藏)</button>}
                    {onToggleFullscreen && <button className="btn btn-ghost" onClick={onToggleFullscreen} style={{ padding: 6 }} title={isFullscreen ? '退出全屏' : '全屏查看'}>{isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}</button>}
                </div>
            </div>

            {/* Viewport Wrapper */}
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <div
                    ref={(el) => {
                        // @ts-ignore
                        containerRef.current = el;
                    }}
                    className="log-chart-scrollable"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onMouseDown={handleMouseDown}
                    onMouseUp={handleMouseUp}
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        overflowX: 'scroll',
                        overflowY: 'hidden',
                        cursor: isAltKeyPressed ? 'crosshair' : 'default',
                        userSelect: 'none' // Prevent text selection while dragging
                    }}
                >
                    <DepthColumn minDepth={minDepth} maxDepth={maxDepth} width={DEPTH_TRACK_WIDTH} viewDepth={viewDepth} onViewDepthChange={handleViewDepthChange} onDoubleClick={() => setDepthModal({ visible: true })} />
                    {visibleTracks.map((name) => (
                        <TrackColumn
                            key={name}
                            name={name}
                            depth={depth}
                            values={curves[name] || []}
                            config={getTrackConfig(name)}
                            minDepth={minDepth}
                            maxDepth={maxDepth}
                            width={TRACK_WIDTH}
                            viewDepth={viewDepth}
                            lithologyMap={lithologyConfigs[name]} // Pass config
                            onViewDepthChange={handleViewDepthChange}
                            onContextMenu={handleContextMenu}
                            onDoubleClickScale={handleDoubleClickScale}
                            onDragStart={handleDragStart}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleDrop}
                        />
                    ))}
                </div>

                {/* Crosshair Overlay (Fixed to Viewport) */}
                {cursorState && (
                    <>
                        {/* Horizontal Line */}
                        <div style={{
                            position: 'absolute',
                            left: DEPTH_TRACK_WIDTH, // Start after depth track
                            right: 0,
                            top: cursorState.y,
                            height: 1,
                            backgroundColor: '#ef4444', // Red color
                            pointerEvents: 'none',
                            zIndex: 100,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
                        }} />

                        {/* Depth Label - Fixed in Depth Column */}
                        <div style={{
                            position: 'absolute',
                            left: DEPTH_TRACK_WIDTH / 2,
                            top: cursorState.y - 10,
                            transform: 'translateX(-50%)',
                            backgroundColor: 'rgba(239, 68, 68, 0.95)',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 'bold',
                            pointerEvents: 'none',
                            zIndex: 101,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                        }}>
                            {cursorState.depth.toFixed(2)} m
                        </div>

                        {/* Curve Value Labels - Centered in each visible track */}
                        {visibleTracks.map((trackName, index) => {
                            const value = getCurveValueAtDepth(trackName, cursorState.depth);
                            if (value === null) return null;

                            // Calculate the center position of this track column
                            // Account for scroll position
                            const trackStartX = DEPTH_TRACK_WIDTH + (index * TRACK_WIDTH) - scrollLeft;
                            const trackCenterX = trackStartX + (TRACK_WIDTH / 2);

                            // Only render if track is visible in viewport
                            const containerWidth = containerRef.current?.clientWidth || 800;
                            if (trackCenterX < DEPTH_TRACK_WIDTH || trackCenterX > containerWidth) {
                                return null;
                            }

                            return (
                                <div
                                    key={trackName}
                                    style={{
                                        position: 'absolute',
                                        left: trackCenterX,
                                        top: cursorState.y - 10,
                                        transform: 'translateX(-50%)',
                                        backgroundColor: 'rgba(30, 41, 59, 0.95)',
                                        color: '#fbbf24',
                                        padding: '2px 6px',
                                        borderRadius: 3,
                                        fontSize: 10,
                                        fontWeight: 'bold',
                                        pointerEvents: 'none',
                                        zIndex: 102,
                                        whiteSpace: 'nowrap',
                                        border: '1px solid rgba(251, 191, 36, 0.5)'
                                    }}
                                >
                                    {value.toFixed(2)}
                                </div>
                            );
                        })}
                    </>
                )}

                {/* Selection Overlay */}
                {isAltKeyPressed && selectionStart && selectionEnd && (
                    <div style={{
                        position: 'absolute',
                        left: DEPTH_TRACK_WIDTH,
                        right: 0,
                        top: Math.min(selectionStart.y, selectionEnd.y),
                        height: Math.abs(selectionEnd.y - selectionStart.y),
                        backgroundColor: 'rgba(59, 130, 246, 0.2)', // blue-500 with opacity
                        borderTop: '1px solid rgba(59, 130, 246, 0.5)',
                        borderBottom: '1px solid rgba(59, 130, 246, 0.5)',
                        pointerEvents: 'none',
                        zIndex: 90
                    }} />
                )}

                <AnalysisPopup
                    visible={popupState.visible}
                    x={popupState.x}
                    y={popupState.y}
                    depthRange={popupState.depthRange}
                    onConfirm={handleAnalysisConfirm}
                    onCancel={() => setPopupState(prev => ({ ...prev, visible: false }))}
                />
            </div>



            <TrackContextMenu
                visible={contextMenu.visible}
                x={contextMenu.x}
                y={contextMenu.y}
                trackName={contextMenu.trackName}
                isLithologyMode={lithologyModeTracks.has(contextMenu.trackName) || contextMenu.trackName.toUpperCase().includes('LITH')}
                canMoveLeft={visibleTracks.indexOf(contextMenu.trackName) > 0}
                canMoveRight={visibleTracks.indexOf(contextMenu.trackName) < visibleTracks.length - 1}
                onClose={() => setContextMenu(prev => ({ ...prev, visible: false }))}
                onDelete={handleDeleteTrack}
                onMoveLeft={() => handleMoveTrack('left')}
                onMoveRight={() => handleMoveTrack('right')}
                onToggleLithologyMode={handleToggleLithologyMode}
                onEditLithologyMap={handleEditLithologyMap} // Pass handler
            />

            <ScaleEditModal visible={scaleModal.visible} trackName={scaleModal.trackName} currentMin={scaleModal.min} currentMax={scaleModal.max} unit={getTrackConfig(scaleModal.trackName).unit} onClose={() => setScaleModal(prev => ({ ...prev, visible: false }))} onConfirm={handleScaleConfirm} />
            <DepthRangeModal visible={depthModal.visible} currentStart={currentRange[0]} currentEnd={currentRange[1]} minLimit={minDepth} maxLimit={maxDepth} onClose={() => setDepthModal({ visible: false })} onConfirm={handleDepthConfirm} />

            <LithologyConfigModal
                visible={lithConfigModal.visible}
                trackName={lithConfigModal.trackName}
                currentValues={lithConfigModal.values}
                currentConfig={lithologyConfigs[lithConfigModal.trackName] || {}}
                onClose={() => setLithConfigModal(prev => ({ ...prev, visible: false }))}
                onSave={handleSaveLithologyMap}
            />
        </div >
    );
});

export default LogChart;
