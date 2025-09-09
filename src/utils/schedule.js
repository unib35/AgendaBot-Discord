/**
 * 사용자 친화적인 요일과 시간을 cron 표현식으로 변환
 * @param {string} day - 요일 (MON, TUE, WED, THU, FRI, SAT, SUN)
 * @param {string} time - 시간 (HH:MM 형식, 예: 09:00, 14:30)
 * @returns {string} cron 표현식
 */
export function buildCronExpression(day, time) {
    // 시간 파싱
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time || '09:00');
    if (!timeMatch) {
        return `0 9 * * ${day || 'MON'}`;
    }
    
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    
    // 유효성 검증
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return `0 9 * * ${day || 'MON'}`;
    }
    
    // cron 표현식 생성: 분 시 일 월 요일
    return `${minute} ${hour} * * ${day || 'MON'}`;
}

/**
 * cron 표현식을 사용자 친화적인 형식으로 변환
 * @param {string} cron - cron 표현식
 * @returns {string} 사용자 친화적인 설명
 */
export function parseCronExpression(cron) {
    if (!cron) return '설정되지 않음';
    
    const parts = cron.split(' ');
    if (parts.length !== 5) return cron;
    
    const [minute, hour, , , dayOfWeek] = parts;
    
    const dayNames = {
        'MON': '월요일',
        'TUE': '화요일',
        'WED': '수요일',
        'THU': '목요일',
        'FRI': '금요일',
        'SAT': '토요일',
        'SUN': '일요일',
        '1': '월요일',
        '2': '화요일',
        '3': '수요일',
        '4': '목요일',
        '5': '금요일',
        '6': '토요일',
        '0': '일요일',
        '7': '일요일'
    };
    
    const dayName = dayNames[dayOfWeek] || dayOfWeek;
    const timeStr = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
    
    return `매주 ${dayName} ${timeStr}`;
}

/**
 * 시간 문자열 유효성 검증
 * @param {string} time - 시간 문자열 (HH:MM)
 * @returns {boolean} 유효한지 여부
 */
export function isValidTime(time) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) return false;
    
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}