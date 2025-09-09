import { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

/**
 * 타임존 가져오기
 */
export function getTimezone() {
    return process.env.TIMEZONE || 'Asia/Seoul';
}

/**
 * 날짜 포맷팅 (한국어 요일)
 */
export function formatDateKorean(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dayOfWeek = days[d.getDay()];
    
    return `${month}/${day}(${dayOfWeek})`;
}

/**
 * D-Day 계산
 */
export function getDDay(targetDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    
    const diffTime = target - today;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'D-Day';
    if (diffDays > 0) return `D-${diffDays}`;
    return `D+${Math.abs(diffDays)}`;
}

/**
 * 다음 30일 옵션 생성
 */
export function generateNext30DaysOptions() {
    const options = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        
        const dateStr = formatDateKorean(date);
        const dDay = getDDay(date);
        const isoDate = date.toISOString().split('T')[0];
        
        // 주말 표시
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const weekendMark = isWeekend ? ' 🔸' : '';
        
        // 특별한 날짜 강조
        let label = `${dateStr} · ${dDay}${weekendMark}`;
        
        if (i === 0) label = `오늘 ${dateStr}`;
        else if (i === 1) label = `내일 ${dateStr}`;
        else if (i === 7) label = `다음주 ${dateStr} · ${dDay}`;
        
        options.push({
            label: label.substring(0, 100), // Discord 제한
            value: isoDate,
            description: isWeekend ? '주말' : undefined
        });
    }
    
    return options;
}

/**
 * 빠른 선택 버튼 생성
 */
export function createQuickDateButtons() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    const nextMonday = new Date(today);
    const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`date_quick:${today.toISOString().split('T')[0]}`)
            .setLabel(`오늘 ${formatDateKorean(today)}`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📅'),
        
        new ButtonBuilder()
            .setCustomId(`date_quick:${tomorrow.toISOString().split('T')[0]}`)
            .setLabel(`내일 ${formatDateKorean(tomorrow)}`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📆'),
        
        new ButtonBuilder()
            .setCustomId(`date_quick:${nextMonday.toISOString().split('T')[0]}`)
            .setLabel(`다음 월요일`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('💼'),
        
        new ButtonBuilder()
            .setCustomId(`date_quick:${nextWeek.toISOString().split('T')[0]}`)
            .setLabel(`+7일`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📌'),
        
        new ButtonBuilder()
            .setCustomId('date_custom')
            .setLabel('직접 입력')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️')
    ];
    
    return new ActionRowBuilder().addComponents(buttons);
}

/**
 * 날짜 셀렉트 메뉴 생성
 */
export function createDateSelectMenu(customId = 'date_select') {
    const options = generateNext30DaysOptions();
    
    // 최대 25개 옵션 (Discord 제한)
    const limitedOptions = options.slice(0, 24);
    
    // 직접 입력 옵션 추가
    limitedOptions.push({
        label: '📝 직접 입력...',
        value: 'custom',
        description: '특정 날짜를 직접 입력합니다'
    });
    
    return new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder('마감일을 선택하세요')
        .addOptions(limitedOptions);
}

/**
 * 날짜 유효성 검증
 */
export function validateDate(dateStr) {
    // YYYY-MM-DD 형식 검증
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
        return { valid: false, error: '형식이 올바르지 않습니다. (예: 2025-01-15)' };
    }
    
    const [year, month, day] = dateStr.split('-').map(Number);
    
    // 범위 검증
    if (year < 2024 || year > 2030) {
        return { valid: false, error: '연도는 2024~2030 사이여야 합니다.' };
    }
    
    if (month < 1 || month > 12) {
        return { valid: false, error: '월은 1~12 사이여야 합니다.' };
    }
    
    // 각 월의 최대 일수
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    // 윤년 체크
    if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) {
        daysInMonth[1] = 29;
    }
    
    if (day < 1 || day > daysInMonth[month - 1]) {
        return { valid: false, error: `${month}월은 1~${daysInMonth[month - 1]}일까지입니다.` };
    }
    
    // 실제 날짜 객체 생성 가능한지 확인
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        return { valid: false, error: '유효하지 않은 날짜입니다.' };
    }
    
    // 과거 날짜 경고 (에러는 아님)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
        return { 
            valid: true, 
            warning: '⚠️ 과거 날짜가 선택되었습니다.',
            date: dateStr 
        };
    }
    
    return { valid: true, date: dateStr };
}

/**
 * 자연어 날짜 파싱 (간단 버전)
 */
export function parseNaturalDate(input) {
    const today = new Date();
    const normalized = input.trim().toLowerCase();
    
    // 오늘/내일/모레
    if (normalized === '오늘' || normalized === 'today') {
        return today.toISOString().split('T')[0];
    }
    
    if (normalized === '내일' || normalized === 'tomorrow') {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    }
    
    if (normalized === '모레') {
        const dayAfter = new Date(today);
        dayAfter.setDate(today.getDate() + 2);
        return dayAfter.toISOString().split('T')[0];
    }
    
    // 다음주
    if (normalized === '다음주' || normalized === 'next week') {
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        return nextWeek.toISOString().split('T')[0];
    }
    
    // +N일 형식
    const plusDaysMatch = /^\+(\d+)일?$/.exec(normalized);
    if (plusDaysMatch) {
        const days = parseInt(plusDaysMatch[1]);
        const future = new Date(today);
        future.setDate(today.getDate() + days);
        return future.toISOString().split('T')[0];
    }
    
    // MM/DD 또는 MM-DD 형식
    const shortDateMatch = /^(\d{1,2})[\/\-](\d{1,2})$/.exec(normalized);
    if (shortDateMatch) {
        const month = parseInt(shortDateMatch[1]);
        const day = parseInt(shortDateMatch[2]);
        const year = today.getFullYear();
        
        // 이미 지난 날짜면 다음 해로
        const testDate = new Date(year, month - 1, day);
        if (testDate < today) {
            testDate.setFullYear(year + 1);
        }
        
        return testDate.toISOString().split('T')[0];
    }
    
    // YYYY-MM-DD 형식 그대로 반환
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return input;
    }
    
    return null;
}

/**
 * 주말 체크 및 영업일 제안
 */
export function checkWeekendAndSuggestBusinessDay(dateStr) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        // 주말인 경우 다음 월요일 제안
        const nextMonday = new Date(date);
        const daysToAdd = dayOfWeek === 0 ? 1 : 2;
        nextMonday.setDate(date.getDate() + daysToAdd);
        
        return {
            isWeekend: true,
            original: dateStr,
            originalFormatted: formatDateKorean(date),
            suggested: nextMonday.toISOString().split('T')[0],
            suggestedFormatted: formatDateKorean(nextMonday)
        };
    }
    
    return {
        isWeekend: false,
        date: dateStr,
        formatted: formatDateKorean(date)
    };
}