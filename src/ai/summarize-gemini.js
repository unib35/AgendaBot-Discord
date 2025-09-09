import { GoogleGenerativeAI } from '@google/generative-ai';
import { decrypt } from '../utils/secret.js';

// ── 설정 ─────────────────────────────────────────────────────────
const DEFAULT_MODEL = 'gemini-2.0-flash-exp';
const MAX_TOPICS = 30;
const MAX_BODY = 1500;
const KST_TZ = process.env.TIMEZONE || 'Asia/Seoul';

// ── 1) 클라이언트/모델 재사용 (게으른 생성) ─────────────────────
const clientCache = new Map(); // guildId -> {client, modelName}

function getModel(apiKey, modelName = DEFAULT_MODEL) {
    if (!apiKey) {
        console.warn('API 키가 제공되지 않았습니다');
        return null;
    }
    
    // 캐시 키 생성
    const cacheKey = `${apiKey.substring(0, 8)}:${modelName}`;
    
    if (!clientCache.has(cacheKey)) {
        const client = new GoogleGenerativeAI(apiKey);
        const model = client.getGenerativeModel({
            model: modelName,
            systemInstruction: `당신은 제품/개발팀의 주간 서기입니다.
- 한국어로 간결하고 실행가능하게 작성합니다.
- 과도한 수식어를 줄이고 불릿을 선호합니다.
- 안건 번호(#1, #2)를 적극적으로 인용해 추적성을 높입니다.`
        });
        clientCache.set(cacheKey, model);
    }
    
    return clientCache.get(cacheKey);
}

// ── 2) 유틸: 날짜 안전 파싱/표시 ────────────────────────────────
function toISODateLocalKST(any) {
    // any: epoch(sec/ms) | ISO string | Date object
    let d;
    if (typeof any === 'number') {
        // 초 단위 추정 → ms로 보정 (2000000000 = 2033년 기준)
        d = new Date(any < 2000000000 ? any * 1000 : any);
    } else if (typeof any === 'string') {
        d = new Date(any);
    } else if (any instanceof Date) {
        d = any;
    } else {
        d = new Date();
    }
    
    if (Number.isNaN(d.getTime())) {
        console.warn('Invalid date:', any);
        d = new Date();
    }

    // KST 표시 (UTC+9)
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(kst.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function normalizeStatus(s) {
    if (!s) return '진행중';
    const t = String(s).toLowerCase();
    if (t.includes('완료') || t.includes('done') || t.includes('complete')) return '완료';
    if (t.includes('대기') || t.includes('pending') || t.includes('hold') || t.includes('보류')) return '대기';
    if (t.includes('취소') || t.includes('cancel')) return '취소';
    if (t.includes('검토') || t.includes('review')) return '검토중';
    if (t.includes('아카') || t.includes('archive')) return '아카이브';
    return '진행중';
}

// ── 3) 공통 생성기(리트라이 포함) ───────────────────────────────
async function generateWithRetry(model, contents, cfg = {}) {
    const maxTries = 2;
    let lastErr = null;
    
    for (let i = 0; i <= maxTries; i++) {
        try {
            const res = await model.generateContent({
                contents,
                generationConfig: {
                    temperature: cfg.temperature ?? 0.4,
                    maxOutputTokens: cfg.maxOutputTokens ?? 1000,
                },
            });
            
            const candidate = res?.response?.candidates?.[0];
            const text = res?.response?.text?.() || '';
            const reason = candidate?.finishReason;
            
            if (reason && reason !== 'STOP') {
                console.warn(`Gemini finishReason=${reason}`);
                if (reason === 'SAFETY') {
                    return '⚠️ 안전 필터에 의해 응답이 차단되었습니다.';
                } else if (reason === 'MAX_TOKENS') {
                    return text + '\n\n(응답이 길이 제한으로 잘렸습니다)';
                }
            }
            
            return text.trim();
        } catch (e) {
            lastErr = e;
            console.error(`Gemini 시도 ${i + 1}/${maxTries + 1} 실패:`, e.message);
            
            // 429/503 등에 대한 지수 백오프
            if (i < maxTries) {
                const delay = 500 * Math.pow(2, i);
                console.log(`${delay}ms 대기 후 재시도...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }
    
    console.error('Gemini generate 최종 실패:', lastErr);
    return null;
}

// ── 4) 주간 요약 (서버별 API 키 지원) ─────────────────────────
export async function summarizeWeeklyGemini(topics, messages = {}, options = {}) {
    if (!topics || topics.length === 0) {
        return '이번 주는 등록된 안건이 없습니다.';
    }
    
    // 옵션에서 API 키와 모델명 추출
    const apiKey = options.apiKey || process.env.GOOGLE_API_KEY;
    const modelName = options.modelName || process.env.GEMINI_MODEL || DEFAULT_MODEL;
    
    const model = getModel(apiKey, modelName);
    if (!model) return null;

    // 상태 집계 + 샘플링
    const statusCount = {};
    const sample = topics.slice(0, MAX_TOPICS).map(t => {
        const status = normalizeStatus(t.status);
        statusCount[status] = (statusCount[status] || 0) + 1;

        const msg = (messages?.[t.message_id] || '').slice(0, MAX_BODY) || '(내용 없음)';
        return {
            id: t.id,
            title: t.title,
            status,
            created: toISODateLocalKST(t.created_at),
            body: msg,
        };
    });

    const statsLines = Object.entries(statusCount)
        .map(([k, v]) => `- ${k}: ${v}건`)
        .join('\n');

    const prompt = `다음은 이번 주(또는 지난 주)의 안건들입니다.
아래 지침을 따라 팀 주간 리포트를 작성하세요.

통계:
- 전체 안건: ${topics.length}건
${statsLines}

안건 목록 (최대 ${MAX_TOPICS}개):
${sample.map(t => `#${t.id} [${t.status}] ${t.title} (${t.created})
${t.body}`).join('\n\n')}

요약 형식(마크다운):
📌 **핵심 이슈** (3-5개)
- 이번 주 가장 중요한 이슈/결정/리스크

✅ **완료된 성과**
- 완료된 주요 작업 요약

🎯 **다음 주 우선순위** (3-5개)
- 다음 주에 집중해야 할 작업

💡 **제안사항**
- 프로세스 개선/주의사항 (있는 경우만)

규칙:
- 한국어, 간결·명확
- 필요 시 안건 번호(#1, #2)를 인용해 추적 가능하게 작성`;

    const text = await generateWithRetry(
        model,
        [{ role: 'user', parts: [{ text: prompt }] }],
        { temperature: 0.35, maxOutputTokens: 1100 }
    );
    
    return text || '요약 생성에 실패했습니다.';
}

// ── 5) 간단 요약 (서버별 API 키 지원) ─────────────────────────
export async function summarizeTopics(topics, { title, customPrompt, apiKey, modelName } = {}) {
    if (!topics || topics.length === 0) {
        return '분석할 안건이 없습니다.';
    }
    
    // API 키와 모델 설정
    const key = apiKey || process.env.GOOGLE_API_KEY;
    const modelToUse = modelName || process.env.GEMINI_MODEL || DEFAULT_MODEL;
    
    const model = getModel(key, modelToUse);
    if (!model) return null;

    const sample = topics.slice(0, MAX_TOPICS).map(t => ({
        id: t.id,
        title: t.title,
        status: normalizeStatus(t.status),
        created: toISODateLocalKST(t.created_at),
    }));
    
    // 상태별 집계
    const statusCount = {};
    sample.forEach(t => {
        statusCount[t.status] = (statusCount[t.status] || 0) + 1;
    });

    const prompt = customPrompt || [
        title || '안건 요약',
        '',
        `통계: 총 ${topics.length}건`,
        Object.entries(statusCount).map(([k, v]) => `- ${k}: ${v}건`).join('\n'),
        '',
        '안건 목록:',
        sample.map(t => `#${t.id} [${t.status}] ${t.title} (${t.created})`).join('\n'),
        '',
        '위 안건들을 한국어로 간단히 요약해주세요.',
        '주요 패턴, 우선순위, 특이사항을 포함해주세요.'
    ].join('\n');

    const text = await generateWithRetry(
        model,
        [{ role: 'user', parts: [{ text: prompt }] }],
        { temperature: 0.3, maxOutputTokens: 600 }
    );
    
    return text || '요약 생성에 실패했습니다.';
}

// ── 6) 길드별 자동 요약용 헬퍼 (암호화된 키 지원) ──────────────
export async function summarizeForGuild(topics, messages, guildSettings) {
    if (!guildSettings?.ai_api_key_encrypted) {
        console.warn('길드 API 키가 설정되지 않았습니다');
        return null;
    }
    
    try {
        // 암호화된 키 복호화
        const apiKey = decrypt(guildSettings.ai_api_key_encrypted);
        if (!apiKey) {
            console.error('API 키 복호화 실패');
            return null;
        }
        
        const modelName = guildSettings.gemini_model || DEFAULT_MODEL;
        
        return await summarizeWeeklyGemini(topics, messages, {
            apiKey,
            modelName
        });
    } catch (error) {
        console.error('길드별 요약 생성 실패:', error);
        return null;
    }
}