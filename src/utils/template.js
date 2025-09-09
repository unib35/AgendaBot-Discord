/**
 * 템플릿 렌더링 - 변수 치환
 * @param {string} template - 템플릿 문자열
 * @param {object} variables - 치환할 변수들
 * @returns {string} 렌더링된 문자열
 */
export function renderTemplate(template, variables = {}) {
    if (!template) return '';
    
    // {{변수명}} 형식을 찾아서 치환
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return variables[key] !== undefined ? variables[key] : match;
    });
}

/**
 * 체크리스트 JSON 파싱
 * @param {string} checklistJson - JSON 문자열
 * @returns {array} 체크리스트 배열
 */
export function parseChecklist(checklistJson) {
    if (!checklistJson) return [];
    
    try {
        const parsed = JSON.parse(checklistJson);
        if (Array.isArray(parsed)) {
            return parsed.filter(item => typeof item === 'string');
        }
        return [];
    } catch (error) {
        console.error('체크리스트 파싱 실패:', error);
        return [];
    }
}

/**
 * 체크리스트를 JSON으로 변환
 * @param {array} checklist - 체크리스트 배열
 * @returns {string} JSON 문자열
 */
export function stringifyChecklist(checklist) {
    if (!Array.isArray(checklist)) return '[]';
    
    // 문자열만 필터링
    const filtered = checklist.filter(item => typeof item === 'string');
    return JSON.stringify(filtered);
}

/**
 * 템플릿 키 유효성 검사
 * @param {string} key - 템플릿 키
 * @returns {boolean} 유효 여부
 */
export function isValidTemplateKey(key) {
    if (!key || typeof key !== 'string') return false;
    
    // 영문, 숫자, 하이픈, 언더스코어만 허용
    // 3-50자 길이
    const keyRegex = /^[a-z0-9_-]{3,50}$/i;
    return keyRegex.test(key);
}

/**
 * 템플릿 변수 추출
 * @param {string} template - 템플릿 문자열
 * @returns {array} 변수 이름 배열
 */
export function extractVariables(template) {
    if (!template) return [];
    
    const matches = template.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    
    // 중복 제거
    const variables = new Set();
    matches.forEach(match => {
        const variable = match.replace(/\{\{|\}\}/g, '');
        variables.add(variable);
    });
    
    return Array.from(variables);
}

/**
 * 기본 변수 생성
 * @returns {object} 기본 변수
 */
export function getDefaultVariables() {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstDate = new Date(now.getTime() + kstOffset);
    
    return {
        today: kstDate.toISOString().split('T')[0],
        year: kstDate.getFullYear(),
        month: String(kstDate.getMonth() + 1).padStart(2, '0'),
        day: String(kstDate.getDate()).padStart(2, '0'),
        weekday: ['일', '월', '화', '수', '목', '금', '토'][kstDate.getDay()]
    };
}

/**
 * 템플릿 미리보기 생성
 * @param {object} template - 템플릿 객체
 * @param {object} variables - 변수
 * @returns {object} 미리보기 객체
 */
export function generatePreview(template, variables = {}) {
    const defaultVars = getDefaultVariables();
    const mergedVars = { ...defaultVars, ...variables };
    
    return {
        title: renderTemplate(template.title, mergedVars),
        body: renderTemplate(template.body, mergedVars),
        checklist: parseChecklist(template.checklist)
    };
}