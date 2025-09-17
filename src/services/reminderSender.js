import {
    markReminderDelivered,
    updateReminderRetry,
    getReminderRetryCount
} from '../db/database.js';
import { calculateRetryDelay } from '../utils/timeUtils.js';
import { createReminderEmbed } from './reminderService.js';

/**
 * 리마인더 전송 (재시도 및 폴백 포함)
 */
export async function sendReminder(client, reminder, topic) {
    const maxRetries = 3;
    const retryCount = getReminderRetryCount(reminder.id);

    if (retryCount >= maxRetries) {
        console.error(`리마인더 #${reminder.id} 최대 재시도 횟수 초과`);
        return false;
    }

    try {
        const guild = await client.guilds.fetch(topic.guild_id);
        const embed = createReminderEmbed(topic, reminder.type);

        // 오버듀 체크 (예정 시간보다 30분 이상 늦음)
        const now = Date.now();
        const isOverdue = (now - reminder.scheduled_at) > 30 * 60 * 1000;

        if (isOverdue) {
            embed.setColor(0xFFA500); // 주황색
            embed.addFields({
                name: '⏱ 늦은 알림',
                value: `예정 시간이 지났습니다 (서버 재시작/지연).\n원래 알림 시간: ${new Date(reminder.scheduled_at).toLocaleString('ko-KR')}`,
                inline: false
            });
        }

        let sent = false;
        let fallbackToChannel = false;

        // DM 전송 시도
        if (reminder.notification_type === 'dm') {
            const assigneeIds = await getAssigneeIds(guild, topic);

            if (assigneeIds.length === 0) {
                console.log(`리마인더 #${reminder.id}: 담당자 없음, 채널로 폴백`);
                fallbackToChannel = true;
            } else {
                // 각 담당자에게 DM 시도
                for (const userId of assigneeIds) {
                    try {
                        const user = await client.users.fetch(userId);
                        await user.send({ embeds: [embed] });
                        sent = true;
                        console.log(`리마인더 #${reminder.id} DM 전송 완료: ${userId}`);
                    } catch (dmError) {
                        console.error(`DM 전송 실패 (${userId}):`, dmError.message);
                    }
                }

                if (!sent) {
                    console.log(`리마인더 #${reminder.id}: 모든 DM 실패, 채널로 폴백`);
                    fallbackToChannel = true;
                }
            }
        }

        // 채널 전송 (원래 채널 또는 폴백)
        if (reminder.notification_type === 'channel' || fallbackToChannel) {
            const channel = await guild.channels.fetch(topic.channel_id);

            if (!channel || !channel.isTextBased()) {
                throw new Error('채널을 찾을 수 없거나 텍스트 채널이 아님');
            }

            // 폴백 안내 추가
            if (fallbackToChannel) {
                embed.setFooter({
                    text: '⚠️ DM 전송에 실패하여 채널로 전송되었습니다.'
                });
            }

            // 스레드가 있으면 스레드로, 없으면 채널로
            const targetChannel = topic.thread_id
                ? await channel.threads.fetch(topic.thread_id).catch(() => channel)
                : channel;

            // 오버듀인 경우 버튼 추가
            const components = [];
            if (isOverdue) {
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`overdue_send_anyway_${reminder.id}`)
                        .setLabel('지금 보내기')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('✔️'),
                    new ButtonBuilder()
                        .setCustomId(`overdue_snooze_${reminder.id}`)
                        .setLabel('스누즈')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⏰'),
                    new ButtonBuilder()
                        .setCustomId(`overdue_dismiss_${reminder.id}`)
                        .setLabel('무시')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('❌')
                );
                components.push(buttons);
            }

            await targetChannel.send({
                embeds: [embed],
                components: components
            });
            sent = true;
            console.log(`리마인더 #${reminder.id} 채널 전송 완료${isOverdue ? ' (오버듀)' : ''}`);
        }

        if (sent) {
            markReminderDelivered(reminder.id);
            return true;
        }

        throw new Error('리마인더 전송 실패');

    } catch (error) {
        console.error(`리마인더 #${reminder.id} 전송 오류:`, error);

        // 재시도 스케줄링
        if (retryCount < maxRetries - 1) {
            updateReminderRetry(reminder.id);
            const delay = calculateRetryDelay(retryCount);

            setTimeout(() => {
                console.log(`리마인더 #${reminder.id} 재시도 ${retryCount + 1}/${maxRetries}`);
                sendReminder(client, reminder, topic);
            }, delay);

            console.log(`리마인더 #${reminder.id} ${delay / 1000}초 후 재시도 예정`);
        }

        return false;
    }
}

/**
 * 안건 담당자 ID 가져오기
 */
async function getAssigneeIds(guild, topic) {
    try {
        const channel = await guild.channels.fetch(topic.channel_id);
        const message = await channel.messages.fetch(topic.message_id);

        if (message && message.mentions.users.size > 0) {
            return Array.from(message.mentions.users.keys());
        }
    } catch (error) {
        console.error('담당자 확인 중 오류:', error);
    }

    return [];
}

/**
 * 리마인더 워커 (정기 실행)
 */
export async function startReminderWorker(client, interval = 60000) {
    setInterval(async () => {
        try {
            const { getPendingReminders, getTopic } = await import('../db/database.js');
            const now = Date.now();
            const reminders = getPendingReminders(now);

            for (const reminder of reminders) {
                const topic = getTopic(reminder.topic_id);
                if (topic) {
                    await sendReminder(client, reminder, topic);
                }
            }
        } catch (error) {
            console.error('리마인더 워커 오류:', error);
        }
    }, interval);

    console.log(`✅ 리마인더 워커 시작 (${interval / 1000}초 간격)`);
}