import {
    addTopic,
    getTopic,
    updateTopicMeetingDate,
    getGuildSettings
} from '../db/database.js';
import { createDefaultReminders } from './reminderService.js';
import { snapToKST9AM } from '../utils/timeUtils.js';

/**
 * 반복 패턴 타입
 */
export const RecurrencePattern = {
    WEEKLY: 'weekly',       // 매주
    BIWEEKLY: 'biweekly',  // 격주
    MONTHLY: 'monthly',     // 매월
    QUARTERLY: 'quarterly', // 분기별
    CUSTOM: 'custom'        // 사용자 정의
};

/**
 * 반복 회의 생성
 */
export async function createRecurringMeeting(topicData, recurrenceOptions) {
    const {
        pattern = RecurrencePattern.WEEKLY,
        interval = 1,           // 반복 간격 (예: 2 = 격주)
        daysOfWeek = [],        // [1,3,5] = 월,수,금
        dayOfMonth = null,      // 매월 특정일
        endDate = null,         // 종료일
        occurrences = null      // 최대 반복 횟수
    } = recurrenceOptions;

    const parentTopic = await addTopic(
        topicData.guild_id,
        topicData.channel_id,
        topicData.message_id,
        topicData.title,
        topicData.created_by,
        topicData.thread_id
    );

    // 부모 안건에 반복 정보 저장
    const db = (await import('../db/database.js')).default;
    const stmt = db.prepare(`
        UPDATE topics
        SET recurrence_pattern = ?,
            recurrence_end_date = ?,
            meeting_date = ?
        WHERE id = ?
    `);

    stmt.run(
        JSON.stringify({ pattern, interval, daysOfWeek, dayOfMonth }),
        endDate,
        topicData.meeting_date,
        parentTopic.id
    );

    // 첫 번째 회의 인스턴스 생성
    if (topicData.meeting_date) {
        await createMeetingInstance(parentTopic, topicData.meeting_date, 0);
    }

    return parentTopic;
}

/**
 * 다음 회의 날짜 계산
 */
export function calculateNextMeetingDate(currentDate, pattern, options = {}) {
    const date = new Date(currentDate);

    switch (pattern) {
        case RecurrencePattern.WEEKLY:
            date.setDate(date.getDate() + (7 * (options.interval || 1)));
            break;

        case RecurrencePattern.BIWEEKLY:
            date.setDate(date.getDate() + 14);
            break;

        case RecurrencePattern.MONTHLY:
            if (options.dayOfMonth) {
                // 특정일로 설정
                date.setMonth(date.getMonth() + (options.interval || 1));
                date.setDate(options.dayOfMonth);
            } else {
                // 같은 요일의 같은 주차
                const dayOfWeek = date.getDay();
                const weekOfMonth = Math.ceil(date.getDate() / 7);
                date.setMonth(date.getMonth() + (options.interval || 1));
                date.setDate(1);

                // 해당 월의 같은 주차, 같은 요일 찾기
                while (date.getDay() !== dayOfWeek) {
                    date.setDate(date.getDate() + 1);
                }
                date.setDate(date.getDate() + (weekOfMonth - 1) * 7);
            }
            break;

        case RecurrencePattern.QUARTERLY:
            date.setMonth(date.getMonth() + 3);
            break;

        case RecurrencePattern.CUSTOM:
            // 사용자 정의 로직
            if (options.daysOfWeek && options.daysOfWeek.length > 0) {
                // 다음 지정 요일 찾기
                let found = false;
                for (let i = 1; i <= 7; i++) {
                    date.setDate(date.getDate() + 1);
                    if (options.daysOfWeek.includes(date.getDay())) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    date.setDate(date.getDate() + 1);
                }
            } else {
                date.setDate(date.getDate() + (options.interval || 7));
            }
            break;
    }

    // KST 9시로 스냅
    return snapToKST9AM(date);
}

/**
 * 회의 인스턴스 생성
 */
export async function createMeetingInstance(parentTopic, meetingDate, index = 0) {
    const db = (await import('../db/database.js')).default;

    // 이미 해당 날짜의 인스턴스가 있는지 확인
    const existing = db.prepare(`
        SELECT id FROM topics
        WHERE parent_topic_id = ?
        AND meeting_date = ?
    `).get(parentTopic.id, meetingDate);

    if (existing) {
        return existing;
    }

    // 새 인스턴스 생성
    const instance = await addTopic(
        parentTopic.guild_id,
        parentTopic.channel_id,
        parentTopic.message_id,
        `${parentTopic.title} (${index + 1}회차)`,
        parentTopic.created_by,
        parentTopic.thread_id
    );

    // 부모 연결 및 회의 날짜 설정
    const stmt = db.prepare(`
        UPDATE topics
        SET parent_topic_id = ?,
            meeting_date = ?,
            reminder_policy = ?
        WHERE id = ?
    `);

    stmt.run(
        parentTopic.id,
        meetingDate,
        parentTopic.reminder_policy || 'default',
        instance.id
    );

    // 리마인더 생성
    const settings = getGuildSettings(parentTopic.guild_id);
    const reminderPolicy = parentTopic.reminder_policy || settings?.reminder_default_policy || 'default';

    await createDefaultReminders(
        instance.id,
        meetingDate,
        reminderPolicy,
        parentTopic.guild_id,
        parentTopic.channel_id
    );

    return instance;
}

/**
 * 다음 반복 회의 생성
 */
export async function createNextRecurrence(topicId) {
    const topic = getTopic(topicId);
    if (!topic || !topic.recurrence_pattern) {
        return null;
    }

    const pattern = JSON.parse(topic.recurrence_pattern);
    const lastMeeting = topic.meeting_date || Date.now();

    // 종료일 체크
    if (topic.recurrence_end_date && lastMeeting >= topic.recurrence_end_date) {
        console.log(`반복 회의 종료: 안건 #${topicId}`);
        return null;
    }

    // 다음 회의 날짜 계산
    const nextDate = calculateNextMeetingDate(lastMeeting, pattern.pattern, pattern);

    // 종료일 체크
    if (topic.recurrence_end_date && nextDate > topic.recurrence_end_date) {
        console.log(`반복 회의 종료: 안건 #${topicId}`);
        return null;
    }

    // 현재 인스턴스 개수 확인
    const db = (await import('../db/database.js')).default;
    const instanceCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM topics
        WHERE parent_topic_id = ?
    `).get(topicId).count;

    // 새 인스턴스 생성
    const newInstance = await createMeetingInstance(topic, nextDate, instanceCount);

    console.log(`✅ 다음 반복 회의 생성: 안건 #${newInstance.id} (${new Date(nextDate).toLocaleString('ko-KR')})`);

    return newInstance;
}

/**
 * 반복 회의 미리 생성
 */
export async function preGenerateRecurringMeetings(topicId, count = 4) {
    const topic = getTopic(topicId);
    if (!topic || !topic.recurrence_pattern) {
        return [];
    }

    const pattern = JSON.parse(topic.recurrence_pattern);
    const instances = [];
    let currentDate = topic.meeting_date || Date.now();

    for (let i = 0; i < count; i++) {
        currentDate = calculateNextMeetingDate(currentDate, pattern.pattern, pattern);

        // 종료일 체크
        if (topic.recurrence_end_date && currentDate > topic.recurrence_end_date) {
            break;
        }

        const instance = await createMeetingInstance(topic, currentDate, i + 1);
        instances.push(instance);
    }

    return instances;
}

/**
 * 반복 패턴 텍스트 포맷팅
 */
export function formatRecurrencePattern(pattern, options = {}) {
    switch (pattern) {
        case RecurrencePattern.WEEKLY:
            return options.interval > 1 ? `${options.interval}주마다` : '매주';
        case RecurrencePattern.BIWEEKLY:
            return '격주';
        case RecurrencePattern.MONTHLY:
            if (options.dayOfMonth) {
                return `매월 ${options.dayOfMonth}일`;
            }
            return options.interval > 1 ? `${options.interval}개월마다` : '매월';
        case RecurrencePattern.QUARTERLY:
            return '분기별';
        case RecurrencePattern.CUSTOM:
            if (options.daysOfWeek && options.daysOfWeek.length > 0) {
                const days = ['일', '월', '화', '수', '목', '금', '토'];
                const dayNames = options.daysOfWeek.map(d => days[d]).join(', ');
                return `매주 ${dayNames}요일`;
            }
            return '사용자 정의';
        default:
            return '1회성';
    }
}

/**
 * 반복 회의 정보 가져오기
 */
export async function getRecurringMeetingInfo(topicId) {
    const db = (await import('../db/database.js')).default;

    const topic = getTopic(topicId);
    if (!topic) return null;

    // 부모 안건인 경우
    if (topic.recurrence_pattern) {
        const instances = db.prepare(`
            SELECT id, meeting_date, status
            FROM topics
            WHERE parent_topic_id = ?
            ORDER BY meeting_date ASC
        `).all(topicId);

        const pattern = JSON.parse(topic.recurrence_pattern);

        return {
            isRecurring: true,
            isParent: true,
            pattern: pattern.pattern,
            patternText: formatRecurrencePattern(pattern.pattern, pattern),
            instances: instances,
            nextMeeting: instances.find(i => i.meeting_date > Date.now()),
            endDate: topic.recurrence_end_date
        };
    }

    // 자식 인스턴스인 경우
    if (topic.parent_topic_id) {
        const parent = getTopic(topic.parent_topic_id);
        if (!parent || !parent.recurrence_pattern) return null;

        const siblings = db.prepare(`
            SELECT id, meeting_date, status
            FROM topics
            WHERE parent_topic_id = ?
            ORDER BY meeting_date ASC
        `).all(topic.parent_topic_id);

        const pattern = JSON.parse(parent.recurrence_pattern);

        return {
            isRecurring: true,
            isParent: false,
            parentId: topic.parent_topic_id,
            pattern: pattern.pattern,
            patternText: formatRecurrencePattern(pattern.pattern, pattern),
            siblings: siblings,
            instanceIndex: siblings.findIndex(s => s.id === topicId),
            endDate: parent.recurrence_end_date
        };
    }

    return null;
}