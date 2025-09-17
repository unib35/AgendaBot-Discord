import {
    addReminder,
    getPendingReminders,
    markReminderDelivered,
    updateReminderSchedule,
    getRemindersByTopic,
    deleteRemindersByTopic,
    getUpcomingReminders,
    getTopic,
    updateTopicMeetingDate
} from '../db/database.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { snapToKST9AM, convertToMilliseconds, parseCustomTime } from '../utils/timeUtils.js';

/**
 * 리마인더 타입별 시간 계산
 */
export function calculateReminderTime(meetingDate, type) {
    const meeting = new Date(meetingDate);

    // 커스텀 시간 형식 처리 (예: "30m", "2h", "3d")
    const customTime = parseCustomTime(type);
    if (customTime) {
        const milliseconds = convertToMilliseconds(customTime.value, customTime.unit);

        if (customTime.unit === 'd' && customTime.value >= 1) {
            // 1일 이상인 경우 오전 9시로 스냅
            return snapToKST9AM(meeting, -customTime.value);
        }

        return meeting.getTime() - milliseconds;
    }

    // 기존 프리셋 타입 처리
    switch(type) {
        case 'before-1h':
            return meeting.getTime() - convertToMilliseconds(1, 'h');
        case 'before-1d':
            return snapToKST9AM(meeting, -1); // 전날 오전 9시
        case 'before-3h':
            return meeting.getTime() - convertToMilliseconds(3, 'h');
        case 'on-time':
            return meeting.getTime(); // 정시
        case 'overdue':
            return snapToKST9AM(meeting, 1); // 다음날 오전 9시
        default:
            return null;
    }
}

/**
 * 안건에 대한 기본 리마인더 생성
 */
export async function createDefaultReminders(topicId, meetingDate, policy = 'default', customOptions = null) {
    if (!meetingDate || policy === 'off') return [];

    const reminders = [];
    let reminderTypes = [];
    let notificationType = 'channel';

    if (policy === 'custom' && customOptions) {
        // 커스텀 리마인더 처리
        const { reminders: customReminders, notification = 'channel' } = customOptions;
        notificationType = notification;

        // 커스텀 리마인더 타입 매핑
        customReminders.forEach(reminder => {
            if (reminder === '1d') reminderTypes.push('before-1d');
            else if (reminder === '3h') reminderTypes.push('before-3h');
            else if (reminder === '1h') reminderTypes.push('before-1h');
            else if (reminder === '0h') reminderTypes.push('on-time');
            else if (reminder.match(/^\d+[mhd]$/)) {
                // 커스텀 시간 형식 직접 추가 (예: "30m", "2h")
                reminderTypes.push(reminder);
            }
        });
    } else {
        // 프리셋 정책 처리
        switch(policy) {
            case 'default':
                reminderTypes = ['before-1d', 'before-1h', 'on-time'];
                break;
            case 'simple':
                reminderTypes = ['before-1h'];
                break;
            case 'all':
                reminderTypes = ['before-1d', 'before-3h', 'before-1h', 'on-time'];
                break;
            default:
                reminderTypes = ['before-1d', 'before-1h', 'on-time'];
        }
    }

    for (const type of reminderTypes) {
        const scheduledAt = calculateReminderTime(meetingDate, type);
        if (scheduledAt && scheduledAt > Date.now()) {
            const reminderId = await addReminder({
                topic_id: topicId,
                type,
                scheduled_at: scheduledAt,
                notification_type: notificationType
            });
            reminders.push(reminderId);
        }
    }

    return reminders;
}

/**
 * 리마인더 메시지 생성
 */
export function createReminderEmbed(topic, reminderType) {
    const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('📅 회의 리마인더')
        .setTimestamp();
    
    const meetingTime = new Date(topic.meeting_date);
    const now = new Date();
    const timeDiff = meetingTime - now;
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    let description = `**안건:** ${topic.title}\n`;
    description += `**회의 시간:** ${meetingTime.toLocaleString('ko-KR')}\n`;
    
    switch(reminderType) {
        case 'before-1d':
            description += `\n⏰ 회의가 **내일** 진행됩니다!`;
            embed.setColor(0x3498db);
            break;
        case 'before-3h':
            description += `\n⏰ 회의가 **3시간 후** 시작됩니다!`;
            embed.setColor(0xf39c12);
            break;
        case 'before-1h':
            description += `\n⏰ 회의가 **1시간 후** 시작됩니다!`;
            embed.setColor(0xe67e22);
            break;
        case 'on-time':
            description += `\n🔔 **지금 회의 시간입니다!**`;
            embed.setColor(0xe74c3c);
            break;
        case 'overdue':
            description += `\n⚠️ 회의 시간이 지났습니다. 진행 상황을 확인해주세요.`;
            embed.setColor(0x95a5a6);
            break;
    }
    
    embed.setDescription(description);
    
    if (topic.thread_id) {
        embed.addFields({
            name: '스레드',
            value: `<#${topic.thread_id}>`,
            inline: true
        });
    }
    
    return embed;
}

/**
 * Snooze 버튼 생성
 */
export function createSnoozeButtons(reminderId) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`reminder_snooze_1h_${reminderId}`)
                .setLabel('+1시간')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏰'),
            new ButtonBuilder()
                .setCustomId(`reminder_snooze_tomorrow_${reminderId}`)
                .setLabel('내일 오전 9시')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📆'),
            new ButtonBuilder()
                .setCustomId(`reminder_snooze_friday_${reminderId}`)
                .setLabel('금요일')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📅'),
            new ButtonBuilder()
                .setCustomId(`reminder_dismiss_${reminderId}`)
                .setLabel('확인')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✅')
        );
    
    return row;
}

/**
 * Snooze 시간 계산
 */
export function calculateSnoozeTime(snoozeType) {
    const now = new Date();
    
    switch(snoozeType) {
        case '1h':
            return now.getTime() + (60 * 60 * 1000);
            
        case 'tomorrow':
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            return tomorrow.getTime();
            
        case 'friday':
            const friday = new Date(now);
            const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
            friday.setDate(friday.getDate() + daysUntilFriday);
            friday.setHours(9, 0, 0, 0);
            return friday.getTime();
            
        default:
            return null;
    }
}

/**
 * 리마인더 전송
 */
export async function sendReminder(client, reminder) {
    try {
        const topic = getTopic(reminder.topic_id);
        if (!topic) return false;
        
        const channel = await client.channels.fetch(topic.channel_id);
        if (!channel) return false;
        
        const embed = createReminderEmbed(topic, reminder.type);
        const buttons = createSnoozeButtons(reminder.id);
        
        const message = {
            embeds: [embed],
            components: [buttons]
        };
        
        // 스레드가 있으면 스레드에, 없으면 채널에 전송
        if (topic.thread_id) {
            try {
                const thread = await channel.threads.fetch(topic.thread_id);
                await thread.send(message);
            } catch (error) {
                // 스레드를 찾을 수 없으면 채널에 전송
                await channel.send(message);
            }
        } else {
            await channel.send(message);
        }
        
        // 전송 완료 표시
        await markReminderDelivered(reminder.id);
        
        // 연체 리마인더 생성 (회의 시간이 지났을 경우)
        if (reminder.type === 'on-time' && topic.status !== '완료') {
            const overdueTime = calculateReminderTime(topic.meeting_date, 'overdue');
            if (overdueTime > Date.now()) {
                await addReminder({
                    topic_id: topic.id,
                    type: 'overdue',
                    scheduled_at: overdueTime,
                    notification_type: 'channel'
                });
            }
        }
        
        return true;
    } catch (error) {
        console.error('리마인더 전송 실패:', error);
        return false;
    }
}

/**
 * 대기 중인 리마인더 처리
 */
export async function processPendingReminders(client) {
    const now = Date.now();
    const reminders = await getPendingReminders(now);
    
    for (const reminder of reminders) {
        await sendReminder(client, reminder);
    }
    
    return reminders.length;
}

/**
 * 리마인더 정책 텍스트 변환
 */
export function getReminderPolicyText(policy) {
    switch(policy) {
        case 'off':
            return '사용 안 함';
        case 'simple':
            return '간단 (1시간 전)';
        case 'all':
            return '전체 (1일 전, 1시간 전, 정시)';
        case 'default':
        default:
            return '기본 (1일 전, 1시간 전, 정시)';
    }
}

/**
 * 안건의 리마인더 삭제
 */
export async function removeTopicReminders(topicId) {
    return await deleteRemindersByTopic(topicId);
}

/**
 * Export wrapper functions for database operations
 */
export { 
    getRemindersByTopic, 
    getUpcomingReminders,
    updateTopicMeetingDate,
    markReminderDelivered,
    updateReminderSchedule
} from '../db/database.js';