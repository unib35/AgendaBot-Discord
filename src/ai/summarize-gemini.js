import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
const MAX_TOPICS = 30;   // 너무 많은 안건 방지
const MAX_BODY = 1500;   // 각 안건 본문 최대 길이

export async function summarizeWeeklyGemini(topics, messages = {}) {
    if (!process.env.GOOGLE_API_KEY) {
        console.warn('GOOGLE_API_KEY가 설정되지 않았습니다');
        return null;
    }
    
    if (!topics || topics.length === 0) {
        return '이번 주는 등록된 안건이 없습니다.';
    }
    
    try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL });
        
        // 안건 샘플링 및 포맷팅
        const sample = topics.slice(0, MAX_TOPICS).map(t => {
            // 메시지 내용 추출 (있는 경우)
            const messageContent = messages[t.message_id] || '';
            const body = messageContent.slice(0, MAX_BODY);
            
            return {
                id: t.id,
                title: t.title,
                status: t.status,
                created_at: new Date(t.created_at * 1000).toISOString().split('T')[0],
                body: body || '(내용 없음)'
            };
        });
        
        // 상태별 집계
        const statusCount = {};
        topics.forEach(t => {
            statusCount[t.status] = (statusCount[t.status] || 0) + 1;
        });
        
        const prompt = [
            `당신은 팀의 주간 회의록 작성 담당자입니다. 아래 안건들을 분석하여 간결하고 실행 가능한 주간 요약을 한국어로 작성해주세요.`,
            ``,
            `통계:`,
            `- 전체 안건: ${topics.length}건`,
            Object.entries(statusCount).map(([status, count]) => `- ${status}: ${count}건`).join('\n'),
            ``,
            `안건 목록 (최대 ${MAX_TOPICS}개):`,
            sample.map(t => `#${t.id} [${t.status}] ${t.title} (${t.created_at})\n${t.body}`).join('\n\n'),
            ``,
            `요약 형식:`,
            `📌 **핵심 이슈** (3-5개)`,
            `- 이번 주 가장 중요한 이슈/결정사항/리스크`,
            ``,
            `✅ **완료된 성과**`,
            `- 완료된 주요 작업 요약`,
            ``,
            `🎯 **다음 주 우선순위** (3-5개)`,
            `- 다음 주에 집중해야 할 작업`,
            ``,
            `💡 **제안사항**`,
            `- 프로세스 개선이나 주의사항 (있는 경우만)`,
            ``,
            `간결하고 명확하게 작성하되, 구체적인 안건 번호(#1, #2 등)를 언급하여 추적 가능하도록 해주세요.`
        ].join('\n');
        
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { 
                temperature: 0.4,
                maxOutputTokens: 1000,
            },
        });
        
        const response = result?.response?.text?.();
        return response?.trim() || null;
        
    } catch (error) {
        console.error('Gemini API 오류:', error);
        return null;
    }
}

export async function summarizeTopics(topics, { title, customPrompt } = {}) {
    if (!process.env.GOOGLE_API_KEY) {
        console.warn('GOOGLE_API_KEY가 설정되지 않았습니다');
        return null;
    }
    
    if (!topics || topics.length === 0) {
        return '분석할 안건이 없습니다.';
    }
    
    try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL });
        
        const sample = topics.slice(0, MAX_TOPICS).map(t => ({
            id: t.id,
            title: t.title,
            status: t.status
        }));
        
        const prompt = customPrompt || [
            title || '안건 요약',
            ``,
            `안건 목록:`,
            sample.map(t => `#${t.id} [${t.status}] ${t.title}`).join('\n'),
            ``,
            `위 안건들을 간단히 요약해주세요.`
        ].join('\n');
        
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { 
                temperature: 0.3,
                maxOutputTokens: 500,
            },
        });
        
        const response = result?.response?.text?.();
        return response?.trim() || null;
        
    } catch (error) {
        console.error('Gemini API 오류:', error);
        return null;
    }
}