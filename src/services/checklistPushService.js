import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import {
    getTopic,
    getPendingReminders,
    markReminderDelivered
} from '../db/database.js';

/**
 * 회의 직전 체크리스트 푸시
 * 회의 30분 전에 체크리스트 요약을 전송
 */
export async function pushChecklistBeforeMeeting(client) {
    const now = Date.now();
    const thirtyMinutesLater = now + (30 * 60 * 1000);

    // 30분 이내 시작되는 회의의 체크리스트 리마인더 조회
    const reminders = getPendingReminders(thirtyMinutesLater);
    const checklistReminders = reminders.filter(r =>
        r.type === 'checklist-push' &&
        r.scheduled_at <= thirtyMinutesLater &&
        r.scheduled_at > now
    );

    for (const reminder of checklistReminders) {
        try {
            await sendChecklistSummary(client, reminder);
            markReminderDelivered(reminder.id);
        } catch (error) {
            console.error(`체크리스트 푸시 실패 (리마인더 #${reminder.id}):`, error);
        }
    }
}

/**
 * 체크리스트 요약 전송
 */
async function sendChecklistSummary(client, reminder) {
    const topic = getTopic(reminder.topic_id);
    if (!topic) {
        console.error(`안건을 찾을 수 없음: #${reminder.topic_id}`);
        return;
    }

    // 체크리스트 파싱
    const checklist = parseChecklist(topic.content);
    if (!checklist || checklist.length === 0) {
        console.log(`체크리스트 없음: 안건 #${topic.id}`);
        return;
    }

    // 체크리스트 상태 분석
    const completed = checklist.filter(item => item.checked);
    const pending = checklist.filter(item => !item.checked);
    const completionRate = Math.round((completed.length / checklist.length) * 100);

    // 임베드 생성
    const embed = new EmbedBuilder()
        .setColor(completionRate === 100 ? 0x00FF00 : 0xFFA500)
        .setTitle(`📋 회의 준비 체크리스트`)
        .setDescription(`**${topic.title}**\n회의가 30분 후 시작됩니다!`)
        .addFields(
            {
                name: '📊 진행 상황',
                value: `${createProgressBar(completionRate)} ${completionRate}%\n✅ 완료: ${completed.length}개 | ⬜ 미완료: ${pending.length}개`,
                inline: false
            }
        )
        .setFooter({ text: `안건 #${topic.id}` })
        .setTimestamp();

    // 미완료 항목 표시
    if (pending.length > 0) {
        const pendingList = pending.slice(0, 10).map((item, idx) =>
            `${idx + 1}. ${item.text}`
        ).join('\n');

        embed.addFields({
            name: '⚠️ 미완료 항목',
            value: pendingList.substring(0, 1024),
            inline: false
        });

        if (pending.length > 10) {
            embed.addFields({
                name: '...',
                value: `외 ${pending.length - 10}개 항목`,
                inline: false
            });
        }
    }

    // 완료 항목 표시 (5개까지)
    if (completed.length > 0) {
        const completedList = completed.slice(0, 5).map((item, idx) =>
            `~~${idx + 1}. ${item.text}~~`
        ).join('\n');

        embed.addFields({
            name: '✅ 완료된 항목',
            value: completedList.substring(0, 1024),
            inline: false
        });
    }

    // 버튼 추가
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`checklist_view_${topic.id}`)
            .setLabel('체크리스트 보기')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📋'),
        new ButtonBuilder()
            .setCustomId(`checklist_thread_${topic.id}`)
            .setLabel('스레드로 이동')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.com/channels/${topic.guild_id}/${topic.thread_id}`)
            .setEmoji('💬')
    );

    // 채널로 전송
    try {
        const channel = await client.channels.fetch(topic.channel_id);
        if (!channel) {
            console.error(`채널을 찾을 수 없음: ${topic.channel_id}`);
            return;
        }

        // 스레드가 있으면 스레드로, 없으면 채널로
        const targetChannel = topic.thread_id
            ? await client.channels.fetch(topic.thread_id)
            : channel;

        await targetChannel.send({
            content: `@here 회의 30분 전 알림! 📢`,
            embeds: [embed],
            components: [buttons]
        });

        console.log(`✅ 체크리스트 푸시 완료: 안건 #${topic.id}`);
    } catch (error) {
        console.error(`체크리스트 전송 실패:`, error);
    }
}

/**
 * 체크리스트 파싱
 */
function parseChecklist(content) {
    if (!content) return [];

    const lines = content.split('\n');
    const checklist = [];

    for (const line of lines) {
        const checkMatch = line.match(/^- \[([ x])\] (.+)$/);
        if (checkMatch) {
            checklist.push({
                checked: checkMatch[1] === 'x',
                text: checkMatch[2].trim()
            });
        }
    }

    return checklist;
}

/**
 * 진행률 바 생성
 */
function createProgressBar(percentage) {
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;

    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);

    return `[${filledBar}${emptyBar}]`;
}

/**
 * 체크리스트 푸시 리마인더 생성
 */
export async function createChecklistPushReminder(topicId, meetingDate) {
    const db = (await import('../db/database.js')).default;

    // 회의 30분 전
    const pushTime = meetingDate - (30 * 60 * 1000);

    // 이미 과거인 경우 생성하지 않음
    if (pushTime <= Date.now()) {
        return null;
    }

    // 이미 존재하는지 확인
    const existing = db.prepare(`
        SELECT id FROM reminders
        WHERE topic_id = ?
        AND type = 'checklist-push'
    `).get(topicId);

    if (existing) {
        // 시간 업데이트
        db.prepare(`
            UPDATE reminders
            SET scheduled_at = ?
            WHERE id = ?
        `).run(pushTime, existing.id);

        return existing.id;
    }

    // 새로 생성
    const stmt = db.prepare(`
        INSERT INTO reminders (topic_id, type, scheduled_at, notification_type)
        VALUES (?, 'checklist-push', ?, 'thread')
    `);

    const result = stmt.run(topicId, pushTime);
    return result.lastInsertRowid;
}

/**
 * 체크리스트 통계 생성
 */
export function generateChecklistStats(topicId) {
    const topic = getTopic(topicId);
    if (!topic) return null;

    const checklist = parseChecklist(topic.content);
    if (!checklist || checklist.length === 0) return null;

    const completed = checklist.filter(item => item.checked).length;
    const total = checklist.length;
    const percentage = Math.round((completed / total) * 100);

    return {
        completed,
        total,
        percentage,
        remaining: total - completed,
        items: checklist
    };
}

/**
 * 회의 전 체크리스트 알림 스케줄러
 */
export function scheduleChecklistPush(client) {
    // 5분마다 체크
    setInterval(() => {
        pushChecklistBeforeMeeting(client);
    }, 5 * 60 * 1000);

    console.log('✅ 체크리스트 푸시 스케줄러 시작');
}