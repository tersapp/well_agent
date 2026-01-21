import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Select, Table, Input, Button, Space, message, Popconfirm, Tabs, InputNumber, Tooltip } from 'antd';
import { SettingOutlined, SaveOutlined, DeleteOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';

// Native color input wrapper with better styling
const ColorInput = ({ value, onChange }: { value: string, onChange: (c: string) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#27272a', padding: '4px 8px', borderRadius: 4, border: '1px solid #3f3f46' }}>
        <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
                width: 24, height: 24,
                padding: 0, border: 'none',
                cursor: 'pointer', backgroundColor: 'transparent',
                borderRadius: 2
            }}
        />
        <span style={{
            fontSize: 12,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#a1a1aa',
            letterSpacing: 0.5
        }}>{value.toUpperCase()}</span>
    </div>
);

export interface LithologyDefinition {
    value: number;
    color: string;
    label: string;
}

// New: Range-based definition
export interface LithologyRangeDefinition {
    minValue: number;
    maxValue: number;
    color: string;
    label: string;
}

export interface LithologyPreset {
    id: string;
    name: string;
    definitions: Record<number, { color: string, label: string }>;
    isCustom?: boolean;
}

// New: Range-based preset structure
export interface LithologyRangePreset {
    id: string;
    name: string;
    ranges: LithologyRangeDefinition[];
    isCustom?: boolean;
}

const BUILTIN_PRESETS: LithologyPreset[] = [
    {
        id: 'default',
        name: '系统默认 (Antigravity)',
        definitions: {
            0: { color: '#e1c699', label: 'Sandstone (砂岩)' },
            1: { color: '#2ecc71', label: 'Shale (页岩)' },
            2: { color: '#3498db', label: 'Limestone (石灰岩)' },
            3: { color: '#9b59b6', label: 'Dolomite (白云岩)' },
            4: { color: '#34495e', label: 'Coal (煤)' },
            5: { color: '#95a5a6', label: 'Siltstone (粉砂岩)' },
            6: { color: '#e74c3c', label: 'Volcanic (火山岩)' },
            7: { color: '#f1c40f', label: 'Salt (盐岩)' },
        }
    },
    {
        id: 'standard',
        name: '国际标准 (Standard)',
        definitions: {
            0: { color: '#FFFF00', label: 'Sandstone' },
            1: { color: '#008000', label: 'Shale' },
            2: { color: '#40E0D0', label: 'Limestone' },
            3: { color: '#800080', label: 'Dolomite' },
            4: { color: '#000000', label: 'Coal' },
        }
    },
    {
        id: 'gray',
        name: '灰度模式 (Grayscale)',
        definitions: {
            0: { color: '#eeeeee', label: 'Lith 0' },
            1: { color: '#cccccc', label: 'Lith 1' },
            2: { color: '#aaaaaa', label: 'Lith 2' },
            3: { color: '#888888', label: 'Lith 3' },
            4: { color: '#666666', label: 'Lith 4' },
            5: { color: '#444444', label: 'Lith 5' },
        }
    }
];

// Built-in range presets
const BUILTIN_RANGE_PRESETS: LithologyRangePreset[] = [
    {
        id: 'default_range',
        name: '默认区间 (Default Ranges)',
        ranges: [
            { minValue: 0, maxValue: 0.5, color: '#e1c699', label: 'Sandstone' },
            { minValue: 0.5, maxValue: 1.5, color: '#2ecc71', label: 'Shale' },
            { minValue: 1.5, maxValue: 2.5, color: '#3498db', label: 'Limestone' },
            { minValue: 2.5, maxValue: 3.5, color: '#9b59b6', label: 'Dolomite' },
            { minValue: 3.5, maxValue: 4.5, color: '#34495e', label: 'Coal' },
        ]
    }
];

interface LithologyConfigModalProps {
    visible: boolean;
    trackName: string;
    currentValues: number[]; // Distinct values found in data
    currentConfig: Record<number, { color: string, label: string }>;
    currentRangeConfig?: LithologyRangeDefinition[]; // New prop for range config
    onClose: () => void;
    onSave: (trackName: string, newConfig: Record<number, { color: string, label: string }>, rangeConfig?: LithologyRangeDefinition[]) => void;
}

const STORAGE_KEY = 'well_agent_lithology_presets';
const RANGE_STORAGE_KEY = 'well_agent_lithology_range_presets';

const LithologyConfigModal: React.FC<LithologyConfigModalProps> = ({
    visible,
    trackName,
    currentValues,
    currentConfig,
    currentRangeConfig,
    onClose,
    onSave
}) => {
    // Mode: 'discrete' or 'range'
    const [mode, setMode] = useState<'discrete' | 'range'>('range');

    // Discrete mode state
    const [config, setConfig] = useState<Record<number, { color: string, label: string }>>({});
    const [selectedPreset, setSelectedPreset] = useState<string>('custom');
    const [userPresets, setUserPresets] = useState<LithologyPreset[]>([]);
    const [newPresetName, setNewPresetName] = useState('');
    const [isSavingPreset, setIsSavingPreset] = useState(false);

    // Range mode state
    const [rangeConfig, setRangeConfig] = useState<LithologyRangeDefinition[]>([]);
    const [selectedRangePreset, setSelectedRangePreset] = useState<string>('custom');
    const [userRangePresets, setUserRangePresets] = useState<LithologyRangePreset[]>([]);
    const [newRangePresetName, setNewRangePresetName] = useState('');
    const [isSavingRangePreset, setIsSavingRangePreset] = useState(false);

    // Load user presets from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try { setUserPresets(JSON.parse(stored)); } catch (e) { console.error("Failed to parse stored presets", e); }
        }
        const rangeStored = localStorage.getItem(RANGE_STORAGE_KEY);
        if (rangeStored) {
            try { setUserRangePresets(JSON.parse(rangeStored)); } catch (e) { console.error("Failed to parse range presets", e); }
        }
    }, []);

    // Initialize config when modal opens
    useEffect(() => {
        if (visible) {
            // Discrete mode init
            const merged = { ...currentConfig };
            setSelectedPreset('custom');
            currentValues.forEach(val => {
                if (!merged[val]) {
                    const defaultDef = BUILTIN_PRESETS[0].definitions[val];
                    merged[val] = defaultDef || { color: '#666666', label: `Lithology ${val}` };
                }
            });
            setConfig(merged);

            // Range mode init
            if (currentRangeConfig && currentRangeConfig.length > 0) {
                setRangeConfig([...currentRangeConfig]);
                setSelectedRangePreset('custom');
            } else {
                // Auto-generate ranges from currentValues
                const sortedVals = [...new Set(currentValues)].sort((a, b) => a - b);
                if (sortedVals.length > 0) {
                    const autoRanges: LithologyRangeDefinition[] = sortedVals.map((val, idx) => {
                        const nextVal = sortedVals[idx + 1];
                        const maxVal = nextVal !== undefined ? (val + nextVal) / 2 : val + 0.5;
                        const prevVal = sortedVals[idx - 1];
                        const minVal = prevVal !== undefined ? (prevVal + val) / 2 : val - 0.5;
                        const defaultDef = BUILTIN_PRESETS[0].definitions[val];
                        return {
                            minValue: minVal,
                            maxValue: maxVal,
                            color: defaultDef?.color || `hsl(${(idx * 50) % 360}, 60%, 50%)`,
                            label: defaultDef?.label || `Range ${val}`
                        };
                    });
                    setRangeConfig(autoRanges);
                } else {
                    setRangeConfig([{ minValue: 0, maxValue: 1, color: '#888888', label: 'Default' }]);
                }
                setSelectedRangePreset('custom');
            }

            setIsSavingPreset(false);
            setNewPresetName('');
            setIsSavingRangePreset(false);
            setNewRangePresetName('');
        }
    }, [visible, currentValues, currentConfig, currentRangeConfig]);

    const allPresets = useMemo(() => [...BUILTIN_PRESETS, ...userPresets], [userPresets]);
    const allRangePresets = useMemo(() => [...BUILTIN_RANGE_PRESETS, ...userRangePresets], [userRangePresets]);

    // Discrete mode handlers
    const handleApplyPreset = (presetId: string) => {
        const preset = allPresets.find(p => p.id === presetId);
        if (!preset) return;
        setSelectedPreset(presetId);
        const newConfig = { ...config };
        Object.keys(newConfig).forEach(key => {
            const val = Number(key);
            if (preset.definitions[val]) newConfig[val] = { ...preset.definitions[val] };
        });
        currentValues.forEach(val => {
            if (preset.definitions[val]) newConfig[val] = { ...preset.definitions[val] };
        });
        setConfig(newConfig);
        message.success(`已应用预设: ${preset.name}`);
    };

    const handleSaveUserPreset = () => {
        if (!newPresetName.trim()) { message.error('请输入预设名称'); return; }
        const newPreset: LithologyPreset = { id: `user_${Date.now()}`, name: newPresetName, definitions: config, isCustom: true };
        const updated = [...userPresets, newPreset];
        setUserPresets(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setIsSavingPreset(false);
        setNewPresetName('');
        setSelectedPreset(newPreset.id);
        message.success('自定义预设保存成功');
    };

    const handleDeletePreset = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = userPresets.filter(p => p.id !== id);
        setUserPresets(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        if (selectedPreset === id) setSelectedPreset('custom');
        message.success('预设已删除');
    };

    const handleItemChange = useCallback((val: number, field: 'color' | 'label', newValue: string) => {
        setConfig(prev => ({ ...prev, [val]: { ...prev[val], [field]: newValue } }));
        setSelectedPreset('custom');
    }, []);

    // Range mode handlers
    const handleApplyRangePreset = (presetId: string) => {
        const preset = allRangePresets.find(p => p.id === presetId);
        if (!preset) return;
        setSelectedRangePreset(presetId);
        setRangeConfig([...preset.ranges]);
        message.success(`已应用区间预设: ${preset.name}`);
    };

    const handleSaveUserRangePreset = () => {
        if (!newRangePresetName.trim()) { message.error('请输入预设名称'); return; }
        const newPreset: LithologyRangePreset = { id: `user_range_${Date.now()}`, name: newRangePresetName, ranges: rangeConfig, isCustom: true };
        const updated = [...userRangePresets, newPreset];
        setUserRangePresets(updated);
        localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(updated));
        setIsSavingRangePreset(false);
        setNewRangePresetName('');
        setSelectedRangePreset(newPreset.id);
        message.success('区间预设保存成功');
    };

    const handleDeleteRangePreset = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = userRangePresets.filter(p => p.id !== id);
        setUserRangePresets(updated);
        localStorage.setItem(RANGE_STORAGE_KEY, JSON.stringify(updated));
        if (selectedRangePreset === id) setSelectedRangePreset('custom');
        message.success('预设已删除');
    };

    const handleRangeChange = useCallback((idx: number, field: keyof LithologyRangeDefinition, newValue: any) => {
        setRangeConfig(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], [field]: newValue };
            return updated;
        });
        setSelectedRangePreset('custom');
    }, []);

    const handleAddRange = () => {
        const last = rangeConfig[rangeConfig.length - 1];
        const newRange: LithologyRangeDefinition = {
            minValue: last ? last.maxValue : 0,
            maxValue: last ? last.maxValue + 1 : 1,
            color: `hsl(${Math.random() * 360}, 60%, 50%)`,
            label: `Range ${rangeConfig.length + 1}`
        };
        setRangeConfig([...rangeConfig, newRange]);
        setSelectedRangePreset('custom');
    };

    const handleRemoveRange = (idx: number) => {
        if (rangeConfig.length <= 1) { message.warning('至少需要保留一个区间'); return; }
        setRangeConfig(prev => prev.filter((_, i) => i !== idx));
        setSelectedRangePreset('custom');
    };

    // Discrete mode data source
    const dataSource = useMemo(() => {
        return currentValues.sort((a, b) => a - b).map(val => ({
            key: val,
            value: val,
            ...config[val]
        }));
    }, [config, currentValues]);

    const discreteColumns = useMemo(() => [
        { title: '值', dataIndex: 'value', width: 60, render: (v: number) => <span style={{ fontWeight: 'bold' }}>{v}</span> },
        { title: '颜色', dataIndex: 'color', width: 140, render: (color: string, record: any) => <ColorInput value={color || '#000000'} onChange={(c) => handleItemChange(record.value, 'color', c)} /> },
        { title: '名称', dataIndex: 'label', render: (label: string, record: any) => <Input value={label} onChange={(e) => handleItemChange(record.value, 'label', e.target.value)} variant="filled" size="small" /> },
        { title: '预览', width: 60, render: (_: any, record: any) => <div style={{ width: '100%', height: 20, backgroundColor: record.color, borderRadius: 3, border: '1px solid #3f3f46' }} /> }
    ], [handleItemChange]);

    // Range mode columns
    const rangeColumns = useMemo(() => [
        {
            title: '最小值',
            dataIndex: 'minValue',
            width: 90,
            render: (v: number, _: any, idx: number) => (
                <InputNumber value={v} size="small" style={{ width: 80 }} onChange={(val) => handleRangeChange(idx, 'minValue', val ?? 0)} />
            )
        },
        {
            title: '最大值',
            dataIndex: 'maxValue',
            width: 90,
            render: (v: number, _: any, idx: number) => (
                <InputNumber value={v} size="small" style={{ width: 80 }} onChange={(val) => handleRangeChange(idx, 'maxValue', val ?? 0)} />
            )
        },
        {
            title: '颜色',
            dataIndex: 'color',
            width: 140,
            render: (color: string, _: any, idx: number) => (
                <ColorInput value={color || '#888888'} onChange={(c) => handleRangeChange(idx, 'color', c)} />
            )
        },
        {
            title: '名称',
            dataIndex: 'label',
            render: (label: string, _: any, idx: number) => (
                <Input value={label} onChange={(e) => handleRangeChange(idx, 'label', e.target.value)} variant="filled" size="small" />
            )
        },
        {
            title: '',
            width: 40,
            render: (_: any, __: any, idx: number) => (
                <Tooltip title="删除此区间">
                    <MinusCircleOutlined style={{ color: '#ef4444', cursor: 'pointer' }} onClick={() => handleRemoveRange(idx)} />
                </Tooltip>
            )
        }
    ], [handleRangeChange, handleRemoveRange]);

    const handleOk = () => {
        if (mode === 'discrete') {
            onSave(trackName, config, undefined);
        } else {
            // Convert ranges to discrete config for backward compatibility, but also pass range config
            const discreteFromRanges: Record<number, { color: string, label: string }> = {};
            rangeConfig.forEach((r, idx) => {
                discreteFromRanges[idx] = { color: r.color, label: r.label };
            });
            onSave(trackName, discreteFromRanges, rangeConfig);
        }
    };

    return (
        <Modal
            title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SettingOutlined /> 岩性色标设置: {trackName}</div>}
            open={visible}
            onCancel={onClose}
            onOk={handleOk}
            width={750}
            closeIcon={<span>×</span>}
        >
            <Tabs
                activeKey={mode}
                onChange={(key) => setMode(key as 'discrete' | 'range')}
                items={[
                    {
                        key: 'range',
                        label: '📊 按区间设置 (推荐)',
                        children: (
                            <>
                                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Space>
                                        <span>区间预设:</span>
                                        <Select
                                            value={selectedRangePreset}
                                            onChange={handleApplyRangePreset}
                                            style={{ width: 220 }}
                                            options={[
                                                { value: 'custom', label: '自定义', disabled: true },
                                                { label: '内置', options: BUILTIN_RANGE_PRESETS.map(p => ({ value: p.id, label: p.name })) },
                                                {
                                                    label: '用户', options: userRangePresets.map(p => ({
                                                        value: p.id,
                                                        label: (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span>{p.name}</span>
                                                                <Popconfirm title="删除?" onConfirm={(e) => handleDeleteRangePreset(p.id, e! as any)} okText="是" cancelText="否">
                                                                    <DeleteOutlined style={{ color: '#ef4444' }} onClick={e => e.stopPropagation()} />
                                                                </Popconfirm>
                                                            </div>
                                                        )
                                                    }))
                                                }
                                            ]}
                                        />
                                    </Space>
                                    <Space>
                                        {isSavingRangePreset ? (
                                            <Space.Compact>
                                                <Input placeholder="名称..." size="small" value={newRangePresetName} onChange={e => setNewRangePresetName(e.target.value)} style={{ width: 100 }} />
                                                <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSaveUserRangePreset}>保存</Button>
                                                <Button size="small" onClick={() => setIsSavingRangePreset(false)}>取消</Button>
                                            </Space.Compact>
                                        ) : (
                                            <Button type="dashed" size="small" icon={<SaveOutlined />} onClick={() => setIsSavingRangePreset(true)}>保存方案</Button>
                                        )}
                                        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddRange}>添加区间</Button>
                                    </Space>
                                </div>
                                <Table
                                    dataSource={rangeConfig.map((r, i) => ({ ...r, key: i }))}
                                    columns={rangeColumns}
                                    pagination={false}
                                    scroll={{ y: 300 }}
                                    size="small"
                                    rowKey="key"
                                />
                                <div style={{ marginTop: 8, color: '#71717a', fontSize: 11 }}>
                                    提示：数据值落在 [最小值, 最大值) 区间内时，将使用对应的颜色填充。
                                </div>
                            </>
                        )
                    },
                    {
                        key: 'discrete',
                        label: '🔢 按单值设置',
                        children: (
                            <>
                                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Space>
                                        <span>预设:</span>
                                        <Select
                                            value={selectedPreset}
                                            onChange={handleApplyPreset}
                                            style={{ width: 220 }}
                                            options={[
                                                { value: 'custom', label: '自定义', disabled: true },
                                                { label: '内置', options: BUILTIN_PRESETS.map(p => ({ value: p.id, label: p.name })) },
                                                {
                                                    label: '用户', options: userPresets.map(p => ({
                                                        value: p.id,
                                                        label: (
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span>{p.name}</span>
                                                                <Popconfirm title="删除?" onConfirm={(e) => handleDeletePreset(p.id, e! as any)} okText="是" cancelText="否">
                                                                    <DeleteOutlined style={{ color: '#ef4444' }} onClick={e => e.stopPropagation()} />
                                                                </Popconfirm>
                                                            </div>
                                                        )
                                                    }))
                                                }
                                            ]}
                                        />
                                    </Space>
                                    {isSavingPreset ? (
                                        <Space.Compact>
                                            <Input placeholder="名称..." size="small" value={newPresetName} onChange={e => setNewPresetName(e.target.value)} style={{ width: 100 }} />
                                            <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSaveUserPreset}>保存</Button>
                                            <Button size="small" onClick={() => setIsSavingPreset(false)}>取消</Button>
                                        </Space.Compact>
                                    ) : (
                                        <Button type="dashed" size="small" icon={<SaveOutlined />} onClick={() => setIsSavingPreset(true)}>保存方案</Button>
                                    )}
                                </div>
                                <Table
                                    dataSource={dataSource}
                                    columns={discreteColumns}
                                    pagination={false}
                                    scroll={{ y: 300 }}
                                    size="small"
                                    rowKey="key"
                                />
                                <div style={{ marginTop: 8, color: '#71717a', fontSize: 11 }}>
                                    提示：适用于岩性值为整数编码的情况，每个整数对应一个颜色。
                                </div>
                            </>
                        )
                    }
                ]}
            />
        </Modal>
    );
};

export default LithologyConfigModal;
