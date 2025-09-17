/**
 * 시간 관련 유틸리티 함수들
 */

/**
 * KST 09:00로 스냅하는 함수
 * @param {Date|number} date - 날짜 객체 또는 타임스탬프
 * @param {number} daysOffset - 일수 오프셋 (음수는 과거, 양수는 미래)
 * @returns {number} KST 09:00로 스냅된 타임스탬프
 */
export function snapToKST9AM(date, daysOffset = 0) {
    const targetDate = new Date(date);

    // 일수 오프셋 적용
    if (daysOffset !== 0) {
        targetDate.setDate(targetDate.getDate() + daysOffset);
    }

    // KST 09:00로 설정
    targetDate.setHours(9, 0, 0, 0);

    return targetDate.getTime();
}

/**
 * 회의 시간 기준 리마인더 시간 계산
 * @param {number} meetingTime - 회의 시간 타임스탬프
 * @param {number} minutes - 몇 분 전
 * @returns {number} 리마인더 시간 타임스탬프
 */
export function calculateReminderFromMeeting(meetingTime, minutes) {
    return meetingTime - (minutes * 60 * 1000);
}

/**
 * 시간 단위 변환
 * @param {number} value - 값
 * @param {string} unit - 단위 (m, h, d)
 * @returns {number} 밀리초
 */
export function convertToMilliseconds(value, unit) {
    const conversions = {
        m: value * 60 * 1000,           // 분
        h: value * 60 * 60 * 1000,      // 시간
        d: value * 24 * 60 * 60 * 1000  // 일
    };

    return conversions[unit] || 0;
}

/**
 * 재시도 지연 시간 계산 (지수적 백오프)
 * @param {number} retryCount - 재시도 횟수
 * @returns {number} 지연 시간 (밀리초)
 */
export function calculateRetryDelay(retryCount) {
    // 30초, 2분, 5분
    const delays = [30000, 120000, 300000];
    return delays[Math.min(retryCount, delays.length - 1)];
}

/**
 * 리마인더 시간 포맷팅
 * @param {number} timestamp - 타임스탬프
 * @returns {string} 포맷된 시간 문자열
 */
export function formatReminderTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = timestamp - now.getTime();

    if (diff < 0) {
        return '지남';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}일 후`;
    } else if (hours > 0) {
        return `${hours}시간 후`;
    } else {
        const minutes = Math.floor(diff / (1000 * 60));
        return `${minutes}분 후`;
    }
}

/**
 * 커스텀 시간 문자열 파싱
 * @param {string} timeStr - 시간 문자열 (예: "30m", "2h", "1d")
 * @returns {object|null} { value: number, unit: string }
 */
export function parseCustomTime(timeStr) {
    const match = timeStr.match(/^(\d+)([mhd])$/);
    if (!match) return null;

    const [, value, unit] = match;
    return {
        value: parseInt(value),
        unit
    };
}