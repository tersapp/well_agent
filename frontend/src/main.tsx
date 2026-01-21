import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import App from './App';
import { SelectionProvider } from './context/SelectionContext';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                token: {
                    colorPrimary: '#2ecc71', // Match the app's green accent
                    colorBgBase: '#18181b',  // Match zinc-900
                    colorBgContainer: '#27272a', // Match zinc-800
                },
                components: {
                    Modal: {
                        contentBg: '#18181b',
                        headerBg: '#18181b',
                    },
                    Table: {
                        colorBgContainer: '#18181b',
                        headerBg: '#27272a',
                    }
                }
            }}
        >
            <SelectionProvider>
                <App />
            </SelectionProvider>
        </ConfigProvider>
    </React.StrictMode>
);
