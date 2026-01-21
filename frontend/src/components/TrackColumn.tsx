import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';

// Range-based lithology definition
export interface LithologyRangeDefinition {
    minValue: number;
    maxValue: number;
    color: string;
    label: string;
}

interface TrackColumnProps {
    name: string;
    depth: number[];
    values: (number | null)[];
    config: {
        color: string;
        fillColor?: string;
        min: number;
        max: number;
        log?: boolean;
        unit: string;
        type?: 'curve' | 'lithology';
    };
    minDepth: number;
    maxDepth: number;
    width: number;
    viewDepth?: [number, number];
    lithologyMap?: Record<number, { color: string, label: string }>;
    lithologyRanges?: LithologyRangeDefinition[]; // NEW: Range-based config
    onViewDepthChange?: (start: number, end: number) => void;
    onContextMenu: (e: React.MouseEvent, trackName: string) => void;
    onDoubleClickScale: (trackName: string, currentMin: number, currentMax: number) => void;
    onDragStart?: (e: React.DragEvent, trackName: string) => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDrop?: (e: React.DragEvent, targetTrackName: string) => void;
}

// Default fallback map
const DEFAULT_LITH_COLOR = '#95a5a6';

const TrackColumn: React.FC<TrackColumnProps> = ({
    name,
    depth,
    values,
    config,
    minDepth,
    maxDepth,
    width,
    viewDepth,
    lithologyMap,
    lithologyRanges, // NEW
    onViewDepthChange,
    onContextMenu,
    onDoubleClickScale,
    onDragStart,
    onDragOver,
    onDrop,
}) => {
    const chartRef = useRef<ReactECharts>(null);
    const isProgrammaticUpdate = useRef(false);

    // Apply viewDepth from parent
    useEffect(() => {
        if (viewDepth && chartRef.current) {
            const instance = chartRef.current.getEchartsInstance();
            if (instance) {
                isProgrammaticUpdate.current = true;
                instance.dispatchAction({
                    type: 'dataZoom',
                    startValue: viewDepth[0],
                    endValue: viewDepth[1],
                });
                setTimeout(() => { isProgrammaticUpdate.current = false; }, 0);
            }
        }
    }, [viewDepth]);

    // Handle zoom events
    const onEvents = useMemo(() => ({
        datazoom: (_params: any) => {
            if (isProgrammaticUpdate.current) return;
            if (!onViewDepthChange || !chartRef.current) return;

            const instance = chartRef.current.getEchartsInstance();
            const option = instance.getOption() as any;
            const dataZoomOpt = option.dataZoom?.[0];

            if (!dataZoomOpt) return;

            let newStart = dataZoomOpt.startValue;
            let newEnd = dataZoomOpt.endValue;

            if (newStart === undefined || newEnd === undefined) {
                const startPct = dataZoomOpt.start ?? 0;
                const endPct = dataZoomOpt.end ?? 100;
                const range = maxDepth - minDepth;
                newStart = minDepth + (startPct / 100) * range;
                newEnd = minDepth + (endPct / 100) * range;
            }

            if (typeof newStart === 'number' && typeof newEnd === 'number') {
                onViewDepthChange(newStart, newEnd);
            }
        }
    }), [onViewDepthChange, maxDepth, minDepth]);

    const option = useMemo(() => {
        const isLithology = config.type === 'lithology';
        const data = depth.map((d, i) => [values[i], d]);

        const gridConfig = {
            left: 10, right: 10, top: 55, bottom: 30,
            backgroundColor: '#0a0a14',
            borderWidth: 1, borderColor: '#3f3f46',
        };

        const commonDataZoom = [{
            type: 'inside',
            yAxisIndex: 0,
            orient: 'vertical',
            zoomOnMouseWheel: true,
            moveOnMouseMove: true,
            throttle: 50,
        }];

        if (isLithology) {
            const blocks: { start: number; end: number; val: number }[] = [];
            let currentBlock: { start: number; end: number; val: number } | null = null;

            for (let i = 0; i < depth.length; i++) {
                const d = depth[i];
                const val = values[i];
                if (d === null || isNaN(d) || val === null || isNaN(val)) continue;
                // Simple logic: extend block if val same
                const step = i < depth.length - 1 ? (depth[i + 1] - d) : (d - depth[i - 1]);
                if (currentBlock && currentBlock.val === val) {
                    currentBlock.end = d + step;
                } else {
                    if (currentBlock) blocks.push(currentBlock);
                    currentBlock = { start: d, end: d + step, val: Math.round(val) };
                }
            }
            if (currentBlock) blocks.push(currentBlock);

            return {
                backgroundColor: 'transparent',
                grid: gridConfig,
                tooltip: {
                    trigger: 'item',
                    backgroundColor: 'rgba(23, 23, 23, 0.9)',
                    borderColor: '#3f3f46',
                    textStyle: { color: '#e4e4e7' },
                    formatter: (params: any) => {
                        const val = params.data[3]; // [0, start, end, val]
                        // Try range lookup first
                        let labelText = `${val}`;
                        if (lithologyRanges && lithologyRanges.length > 0) {
                            const range = lithologyRanges.find(r => val >= r.minValue && val < r.maxValue);
                            if (range) labelText = `${val.toFixed(2)} - ${range.label}`;
                        } else if (lithologyMap) {
                            const def = lithologyMap[Math.round(val)];
                            if (def) labelText = `${Math.round(val)} - ${def.label}`;
                        }
                        const depthRange = `${params.data[1].toFixed(2)} - ${params.data[2].toFixed(2)} m`;
                        return `${name}<br/>${labelText}<br/>${depthRange}`;
                    }
                },
                xAxis: { show: false, min: 0, max: 1 },
                yAxis: { type: 'value', inverse: true, min: minDepth, max: maxDepth, show: false },
                dataZoom: commonDataZoom,
                series: [{
                    type: 'custom',
                    renderItem: (params: any, api: any) => {
                        const yStart = api.coord([0, api.value(1)])[1];
                        const yEnd = api.coord([0, api.value(2)])[1];
                        const height = Math.abs(yEnd - yStart);
                        const w = api.size([1, 0])[0];
                        const val = api.value(3);
                        // Lookup color: prioritize range config
                        let color = DEFAULT_LITH_COLOR;
                        if (lithologyRanges && lithologyRanges.length > 0) {
                            const range = lithologyRanges.find(r => val >= r.minValue && val < r.maxValue);
                            if (range) color = range.color;
                        } else if (lithologyMap) {
                            color = lithologyMap[Math.round(val)]?.color || DEFAULT_LITH_COLOR;
                        }

                        return {
                            type: 'rect',
                            shape: { x: params.coordSys.x, y: yStart, width: w, height: height },
                            style: { fill: color, stroke: 'none' }
                        };
                    },
                    data: blocks.map(b => [0, b.start, b.end, b.val]),
                }]
            };
        }

        return {
            backgroundColor: 'transparent',
            grid: gridConfig,
            xAxis: {
                type: config.log ? 'log' : 'value',
                min: config.min, max: config.max,
                position: 'top',
                axisLine: { show: true, lineStyle: { color: config.color, width: 2 } },
                axisTick: { show: true, lineStyle: { color: '#3f3f46' } },
                axisLabel: { color: '#a1a1aa', fontSize: 9 },
                splitLine: { show: true, lineStyle: { color: '#1f1f2e', type: 'dashed' } },
            },
            yAxis: { type: 'value', inverse: true, min: minDepth, max: maxDepth, show: false },
            dataZoom: commonDataZoom,
            series: [{
                type: 'line',
                data: data,
                connectNulls: false,
                symbol: 'none',
                lineStyle: { color: config.color, width: 1.5 },
                areaStyle: config.fillColor ? { color: config.fillColor, origin: 'start' } : undefined,
            }],
        };
    }, [name, depth, values, config, minDepth, maxDepth, lithologyMap, lithologyRanges]);

    const unitDisplay = config.unit ? `(${config.unit})` : '';

    return (
        <div
            style={{
                width, minWidth: width, height: '100%',
                display: config ? 'flex' : 'none',
                flexDirection: 'column',
                borderRight: '1px solid #3f3f46',
            }}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, name); }}

            draggable={true}
            onDragStart={(e) => onDragStart?.(e, name)}
            onDragOver={(e) => { e.preventDefault(); onDragOver?.(e); }}
            onDrop={(e) => onDrop?.(e, name)}
        >
            <div style={{
                height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#1a1a2e', borderBottom: '1px solid #3f3f46',
                cursor: 'grab', userSelect: 'none',
            }} title={`${name} ${unitDisplay}\n右键: 菜单 | 拖拽: 排序`}>
                <span style={{ color: config.color, fontWeight: 'bold', fontSize: 11 }}>{name}</span>
                {unitDisplay && <span style={{ color: '#71717a', fontSize: 9, marginLeft: 4 }}>{unitDisplay}</span>}
            </div>

            <div style={{ flex: 1 }} onDoubleClick={() => onDoubleClickScale(name, config.min, config.max)}>
                <ReactECharts
                    key={config.type}
                    ref={chartRef}
                    option={option}
                    onEvents={onEvents}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                    notMerge={false}
                />
            </div>
        </div>
    );
};

export default TrackColumn;
