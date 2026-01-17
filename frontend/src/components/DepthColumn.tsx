import React, { useMemo, useRef, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';

interface DepthColumnProps {
    minDepth: number;
    maxDepth: number;
    width: number;
    viewDepth?: [number, number];
    onViewDepthChange?: (start: number, end: number) => void;
    onDoubleClick?: () => void;
}

const DepthColumn: React.FC<DepthColumnProps> = ({
    minDepth,
    maxDepth,
    width,
    viewDepth,
    onViewDepthChange,
    onDoubleClick,
}) => {
    const chartRef = useRef<ReactECharts>(null);
    const isProgrammaticUpdate = useRef(false);

    // Apply viewDepth from parent when it changes
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
                setTimeout(() => {
                    isProgrammaticUpdate.current = false;
                }, 0);
            }
        }
    }, [viewDepth]);

    // Handle zoom events and emit to parent
    const onEvents = useMemo(() => ({
        datazoom: (params: any) => {
            if (isProgrammaticUpdate.current) return;
            if (!onViewDepthChange || !chartRef.current) return;

            // Retrieve actual option from instance to get accurate range
            const instance = chartRef.current.getEchartsInstance();
            const option = instance.getOption() as any;
            const dataZoomOpt = option.dataZoom?.[0];

            if (!dataZoomOpt) return;

            let newStart = dataZoomOpt.startValue;
            let newEnd = dataZoomOpt.endValue;

            // Fallback to percentage if value is missing
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
        const range = maxDepth - minDepth;
        let interval = 50;
        if (range < 50) interval = 5;
        else if (range < 200) interval = 10;
        else if (range < 1000) interval = 50;
        else if (range < 5000) interval = 100;
        else interval = 500;

        return {
            backgroundColor: '#0a0a14',
            grid: { left: 45, right: 0, top: 55, bottom: 30, borderWidth: 0 },
            xAxis: { show: false, min: 0, max: 1 },
            yAxis: {
                type: 'value',
                inverse: true,
                min: minDepth,
                max: maxDepth,
                interval: interval,
                position: 'left',
                axisLine: { show: true, lineStyle: { color: '#71717a', width: 1.5 } },
                axisTick: { show: true, length: 8, lineStyle: { color: '#71717a', width: 1.5 } },
                minorTick: { show: true, splitNumber: 5, length: 4, lineStyle: { color: '#3f3f46', width: 1 } },
                axisLabel: {
                    color: '#e4e4e7', fontSize: 11, fontWeight: 'bold',
                    fontFamily: 'JetBrains Mono, monospace',
                    formatter: (v: number) => v.toFixed(0), margin: 12,
                },
                splitLine: { show: true, lineStyle: { color: '#1f1f2e', width: 1 } },
            },
            dataZoom: [{
                type: 'inside',
                yAxisIndex: 0,
                orient: 'vertical',
                zoomOnMouseWheel: true,
                moveOnMouseMove: true,
                throttle: 50,
            }],
            series: [{
                type: 'line',
                data: [[0, minDepth], [0, maxDepth]],
                symbol: 'none',
                lineStyle: { opacity: 0 },
                silent: true,
            }],
            animation: false,
        };
    }, [minDepth, maxDepth]);

    return (
        <div style={{
            width, minWidth: width, height: '100%',
            display: 'flex', flexDirection: 'column',
            borderRight: '2px solid #52525b', backgroundColor: '#0f0f1a',
        }}>
            <div style={{
                height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#1a1a2e', borderBottom: '1px solid #3f3f46',
                userSelect: 'none', cursor: 'pointer',
            }} title="双击设置深度范围" onDoubleClick={onDoubleClick}>
                <span style={{ color: '#e4e4e7', fontWeight: 'bold', fontSize: 11, letterSpacing: 0.5 }}>DEPTH</span>
            </div>

            <div style={{ flex: 1, position: 'relative' }} onDoubleClick={onDoubleClick}>
                <ReactECharts
                    ref={chartRef}
                    option={option}
                    onEvents={onEvents}
                    style={{ height: '100%', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                    notMerge={false}
                />
                <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 9, color: '#71717a', pointerEvents: 'none' }}>(m)</div>
            </div>
        </div>
    );
};

export default DepthColumn;
