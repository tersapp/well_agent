import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 120000, // 2 minutes for LLM analysis
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
    curve_mapping?: {
        matched: Record<string, string>;
        unmatched: string[];
        curve_details: Record<string, { unit: string; description: string }>;
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

    async suggestCurveMapping(sessionId: string) {
        const response = await apiClient.post('/api/suggest-curve-mapping', null, {
            params: { session_id: sessionId },
        });
        return response.data;
    },

    async saveCurveMapping(mappings: Record<string, string>) {
        const response = await apiClient.post('/api/save-curve-mapping', { mappings });
        return response.data;
    },

    async getCurveStandardTypes() {
        const response = await apiClient.get('/api/curve-standard-types');
        return response.data;
    },

    // --- Conversation History API ---

    async listConversations(params?: {
        skip?: number;
        limit?: number;
        wellName?: string;
        search?: string;
    }) {
        const response = await apiClient.get('/api/conversations', {
            params: {
                skip: params?.skip ?? 0,
                limit: params?.limit ?? 20,
                well_name: params?.wellName,
                search: params?.search,
            },
        });
        return response.data;
    },

    async getConversation(conversationId: string) {
        const response = await apiClient.get(`/api/conversations/${conversationId}`);
        return response.data;
    },

    async deleteConversation(conversationId: string) {
        const response = await apiClient.delete(`/api/conversations/${conversationId}`);
        return response.data;
    },

    // --- Agent Registry API ---
    async getAgents(): Promise<{ success: boolean; agents: AgentInfo[] }> {
        const response = await apiClient.get('/api/agents');
        return response.data;
    },

    // --- Streaming Analysis API ---
    createStreamingAnalysis(
        startDepth: number,
        endDepth: number,
        focusNote: string | undefined,
        sessionId: string,
        onMessage: (data: StreamEvent) => void,
        onError: (error: Event) => void,
        onComplete: () => void
    ): EventSource {
        const params = new URLSearchParams({
            session_id: sessionId,
        });

        // For POST with EventSource, we need a workaround since EventSource only supports GET
        // We'll use fetch with ReadableStream instead
        const url = `${API_BASE_URL}/api/analyze/stream?${params.toString()}`;

        // Use custom fetch-based SSE for POST support
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start_depth: startDepth,
                end_depth: endDepth,
                focus_note: focusNote,
            }),
        })
            .then(async (response) => {
                if (!response.ok || !response.body) {
                    throw new Error(`HTTP error ${response.status}`);
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        onComplete();
                        break;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                onMessage(data);
                            } catch (e) {
                                console.warn('Failed to parse SSE data:', line);
                            }
                        }
                    }
                }
            })
            .catch((error) => {
                onError(error);
            });

        // Return a dummy EventSource-like object for compatibility
        return { close: () => { } } as EventSource;
    },
};

// Agent info interface
export interface AgentInfo {
    key: string;
    name: string;
    abbr: string;
    color: string;
}

// Stream event types
export interface StreamEvent {
    type: 'agent_message' | 'final_decision' | 'done' | 'error';
    agent?: string;
    content?: string;
    confidence?: number;
    is_final?: boolean;
    decision?: string;
    reasoning?: string;
    message?: string;
}

// Conversation interfaces
export interface Conversation {
    _id: string;
    session_id: string;
    well_name: string;
    timestamp: string;
    depth_range: { start: number; end: number };
    user_question: string;
    messages: AnalysisMessage[];
    final_decision: {
        status: string;
        decision: string;
        confidence: number;
        reasoning: string;
    } | null;
}

export interface ConversationListResponse {
    success: boolean;
    data: Conversation[];
    total: number;
    skip: number;
    limit: number;
}

export default api;
