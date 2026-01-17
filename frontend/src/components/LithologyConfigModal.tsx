import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Select, Table, Input, Button, Space, message, Popconfirm } from 'antd';
import { SettingOutlined, SaveOutlined, DeleteOutlined } from '@ant-design/icons';

// Native color input wrapper with better styling
const ColorInput = ({ value, onChange }: { value: string, onChange: (c: string) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, backgroundColor: '#27272a', padding: '4px 8px', borderRadius: 4, border: '1px solid #3f3f46' }}>
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
            fontSize: 13,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#e4e4e7',
            letterSpacing: 0.5
        }}>{value.toUpperCase()}</span>
    </div>
);

export interface LithologyDefinition {
    value: number;
    color: string;
    label: string;
}

export interface LithologyPreset {
    id: string;
    name: string;
    definitions: Record<number, { color: string, label: string }>;
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
            30: { color: '#FFFF00', label: 'Sandstone' },
            31: { color: '#008000', label: 'Shale' },
            32: { color: '#40E0D0', label: 'Limestone' },
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

interface LithologyConfigModalProps {
    visible: boolean;
    trackName: string;
    currentValues: number[]; // Distinct values found in data
    currentConfig: Record<number, { color: string, label: string }>;
    onClose: () => void;
    onSave: (trackName: string, newConfig: Record<number, { color: string, label: string }>) => void;
}

const STORAGE_KEY = 'well_agent_lithology_presets';

const LithologyConfigModal: React.FC<LithologyConfigModalProps> = ({
    visible,
    trackName,
    currentValues,
    currentConfig,
    onClose,
    onSave
}) => {
    const [config, setConfig] = useState<Record<number, { color: string, label: string }>>({});
    const [selectedPreset, setSelectedPreset] = useState<string>('custom');

    const [userPresets, setUserPresets] = useState<LithologyPreset[]>([]);
    const [newPresetName, setNewPresetName] = useState('');
    const [isSavingPreset, setIsSavingPreset] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setUserPresets(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse stored presets", e);
            }
        }
    }, []);

    useEffect(() => {
        if (visible) {
            const merged = { ...currentConfig };
            setSelectedPreset('custom');
            currentValues.forEach(val => {
                if (!merged[val]) {
                    const defaultDef = BUILTIN_PRESETS[0].definitions[val];
                    merged[val] = defaultDef || {
                        color: '#666666',
                        label: `Lithology ${val}`
                    };
                }
            });
            setConfig(merged);
            setIsSavingPreset(false);
            setNewPresetName('');
        }
    }, [visible, currentValues, currentConfig]);

    const allPresets = useMemo(() => [...BUILTIN_PRESETS, ...userPresets], [userPresets]);

    const handleApplyPreset = (presetId: string) => {
        const preset = allPresets.find(p => p.id === presetId);
        if (!preset) return;

        setSelectedPreset(presetId);

        const newConfig = { ...config };

        Object.keys(newConfig).forEach(key => {
            const val = Number(key);
            if (preset.definitions[val]) {
                newConfig[val] = { ...preset.definitions[val] };
            }
        });

        currentValues.forEach(val => {
            if (preset.definitions[val]) {
                newConfig[val] = { ...preset.definitions[val] };
            }
        });

        setConfig(newConfig);
        message.success(`已应用预设: ${preset.name}`);
    };

    const handleSaveUserPreset = () => {
        if (!newPresetName.trim()) {
            message.error('请输入预设名称');
            return;
        }

        const newPreset: LithologyPreset = {
            id: `user_${Date.now()}`,
            name: newPresetName,
            definitions: config,
            isCustom: true
        };

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
        setConfig(prev => ({
            ...prev,
            [val]: {
                ...prev[val],
                [field]: newValue
            }
        }));
        setSelectedPreset('custom');
    }, []);

    const dataSource = useMemo(() => {
        return currentValues.sort((a, b) => a - b).map(val => ({
            key: val,
            value: val,
            ...config[val] // color, label
        }));
    }, [config, currentValues]);

    // Memoized columns for focus stability
    const columns = useMemo(() => [
        {
            title: '值 (Value)',
            dataIndex: 'value',
            width: 80,
            render: (v: number) => <span style={{ fontWeight: 'bold' }}>{v}</span>
        },
        {
            title: '颜色 (Color)',
            dataIndex: 'color',
            width: 180,
            render: (color: string, record: any) => (
                <ColorInput
                    value={color || '#000000'}
                    onChange={(c) => handleItemChange(record.value, 'color', c)}
                />
            )
        },
        {
            title: '名称 (Label)',
            dataIndex: 'label',
            render: (label: string, record: any) => (
                <Input
                    value={label}
                    onChange={(e) => handleItemChange(record.value, 'label', e.target.value)}
                    variant="filled" // AntD 5 variant for nicer background
                />
            )
        },
        {
            title: '预览',
            width: 80,
            render: (_: any, record: any) => (
                <div style={{
                    width: '100%',
                    height: 24,
                    backgroundColor: record.color,
                    borderRadius: 4,
                    border: '1px solid #3f3f46',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }} />
            )
        }
    ], [handleItemChange]);

    return (
        <Modal
            title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SettingOutlined /> 岩性色标设置: {trackName}</div>}
            open={visible}
            onCancel={onClose}
            onOk={() => onSave(trackName, config)}
            width={700}
            // Removed manual style overrides, relying on ConfigProvider
            closeIcon={<span>×</span>}
        >
            <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space>
                        <span>选择方案:</span>
                        <Select
                            value={selectedPreset}
                            onChange={handleApplyPreset}
                            style={{ width: 280 }}
                            optionLabelProp="label"
                            // Removed manual dropdownStyle
                            options={[
                                { value: 'custom', label: 'Custom (自定义)', disabled: true },
                                { label: '内置方案', options: BUILTIN_PRESETS.map(p => ({ value: p.id, label: p.name })) },
                                {
                                    label: '用户方案', options: userPresets.map(p => ({
                                        value: p.id,
                                        label: (
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>{p.name}</span>
                                                <Popconfirm title="删除此方案?" onConfirm={(e) => handleDeletePreset(p.id, e! as any)} okText="Yes" cancelText="No">
                                                    <DeleteOutlined style={{ color: '#ef4444' }} onClick={e => e.stopPropagation()} />
                                                </Popconfirm>
                                            </div>
                                        )
                                    }))
                                }
                            ]}
                        />
                    </Space>

                    <div style={{ display: 'flex', gap: 8 }}>
                        {isSavingPreset ? (
                            <Space.Compact style={{ width: 200 }}>
                                <Input
                                    placeholder="方案名称..."
                                    size="small"
                                    value={newPresetName}
                                    onChange={e => setNewPresetName(e.target.value)}
                                />
                                <Button type="primary" size="small" icon={<SaveOutlined />} onClick={handleSaveUserPreset}>保存</Button>
                                <Button size="small" onClick={() => setIsSavingPreset(false)}>取消</Button>
                            </Space.Compact>
                        ) : (
                            <Button
                                type="dashed"
                                icon={<SaveOutlined />}
                                size="small"
                                onClick={() => setIsSavingPreset(true)}
                            >
                                保存当前配置为方案
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <Table
                dataSource={dataSource}
                columns={columns}
                pagination={false}
                scroll={{ y: 400 }}
                size="small"
                rowKey="key"
            // Removed manual component overrides to use AntD Dark Theme naturally
            />

            <div style={{ marginTop: 12, color: '#71717a', fontSize: 12 }}>
                保存方案会将当前的 "数值-颜色-标签" 映射表存储到本地，方便在其他井中复用。
            </div>
        </Modal>
    );
};

export default LithologyConfigModal;
