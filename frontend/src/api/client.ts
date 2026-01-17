import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

export interface LogData {
    metadata: {
        well: {
            name: string;
            strt: number;
            stop: number;
        };
    };
    curves: Record<string, (number | null)[]>;
    curve_info: Record<string, { unit: string; description: string }>;
}

export interface ParseResult {
    success: boolean;
    session_id: string;
    data: LogData;
    qc_report: {
        pass: boolean;
        issues: string[];
        warnings: string[];
    };
}

export interface AnalysisMessage {
    agent: string;
    content: string;
    confidence: number;
    is_final?: boolean;
}

export interface AnalysisResult {
    success: boolean;
    messages: AnalysisMessage[];
    final_decision: {
        decision: string;
        confidence: number;
        depth_range: string;
    } | null;
}

export const api = {
    async parseLasFile(file: File): Promise<ParseResult> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.post<ParseResult>('/api/parse-las', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    async runAnalysis(
        startDepth: number,
        endDepth: number,
        focusNote?: string,
        sessionId?: string
    ): Promise<AnalysisResult> {
        const response = await apiClient.post<AnalysisResult>(
            '/api/analyze',
            {
                start_depth: startDepth,
                end_depth: endDepth,
                focus_note: focusNote,
            },
            {
                params: { session_id: sessionId },
            }
        );
        return response.data;
    },

    async getStatus() {
        const response = await apiClient.get('/api/status');
        return response.data;
    },
};

export default api;
