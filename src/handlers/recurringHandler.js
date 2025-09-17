import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} from 'discord.js';
import {
    RecurrencePattern,
    createRecurringMeeting,
    formatRecurrencePattern,
    preGenerateRecurringMeetings,
    getRecurringMeetingInfo
} from '../services/recurringMeetingService.js';
import {
    getPendingTitle,
    getPendingMeetingTime,
    getPendingReminderPolicy,
    clearAllPending
} from '../utils/tempStorage.js';

// 세션 저장소
const recurrenceSessions = new Map();

/**
 * 반복 설정 선택 화면
 */
export async function showRecurrenceOptions(interaction) {
    const userId = interaction.user.id;

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔁 반복 회의 설정')
        .setDescription('이 회의를 반복하시겠습니까?')
        .addFields(
            {
                name: '📅 반복 패턴',
                value: '• **매주**: 매주 같은 요일\n• **격주**: 2주마다\n• **매월**: 매월 같은 날짜 또는 같은 주차\n• **분기별**: 3개월마다',
                inline: false
            },
            {
                name: '⚙️ 고급 옵션',
                value: '• 반복 간격 설정\n• 종료일 지정\n• 특정 요일 선택',
                inline: false
            }
        )
        .setFooter({ text: '반복 패턴을 선택하세요' })
        .setTimestamp();

    const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`recurrence_pattern_${userId}`)
            .setPlaceholder('반복 패턴 선택')
            .addOptions([
                {
                    label: '매주',
                    description: '매주 같은 요일에 반복',
                    value: 'weekly',
                    emoji: '📅'
                },
                {
                    label: '격주',
                    description: '2주마다 반복',
                    value: 'biweekly',
                    emoji: '📆'
                },
                {
                    label: '매월',
                    description: '매월 같은 날짜에 반복',
                    value: 'monthly',
                    emoji: '🗓️'
                },
                {
                    label: '분기별',
                    description: '3개월마다 반복',
                    value: 'quarterly',
                    emoji: '📊'
                },
                {
                    label: '사용자 정의',
                    description: '원하는 패턴으로 설정',
                    value: 'custom',
                    emoji: '⚙️'
                },
                {
                    label: '반복 없음',
                    description: '1회성 회의',
                    value: 'none',
                    emoji: '1️⃣'
                }
            ])
    );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`recurrence_advanced_${userId}`)
            .setLabel('고급 설정')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚙️'),
        new ButtonBuilder()
            .setCustomId(`recurrence_preview_${userId}`)
            .setLabel('미리보기')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👁️')
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`recurrence_confirm_${userId}`)
            .setLabel('확인')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`recurrence_cancel_${userId}`)
            .setLabel('취소')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );

    await interaction.update({
        embeds: [embed],
        components: [selectMenu, buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 반복 패턴 선택 처리
 */
export async function handleRecurrencePattern(interaction) {
    const userId = interaction.user.id;
    const pattern = interaction.values[0];

    if (pattern === 'none') {
        // 반복 없음 선택 - 최종 등록으로 이동
        await finalizeAgenda(interaction, null);
        return;
    }

    // 세션에 패턴 저장
    const session = recurrenceSessions.get(userId) || {};
    session.pattern = pattern;
    recurrenceSessions.set(userId, session);

    if (pattern === 'custom') {
        // 사용자 정의 모달 표시
        await showCustomRecurrenceModal(interaction);
        return;
    }

    // 선택된 패턴으로 미리보기 활성화
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔁 반복 회의 설정')
        .setDescription(`**${formatRecurrencePattern(pattern)}** 반복이 선택되었습니다.`)
        .addFields(
            {
                name: '📅 반복 패턴',
                value: formatRecurrenceDescription(pattern),
                inline: false
            },
            {
                name: '⏰ 다음 회의 예정일',
                value: generatePreviewDates(pattern, 3),
                inline: false
            }
        )
        .setFooter({ text: '확인을 눌러 안건을 생성하세요' })
        .setTimestamp();

    // 버튼 업데이트
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`recurrence_advanced_${userId}`)
            .setLabel('고급 설정')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⚙️'),
        new ButtonBuilder()
            .setCustomId(`recurrence_preview_${userId}`)
            .setLabel('미리보기')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('👁️'),
        new ButtonBuilder()
            .setCustomId(`recurrence_confirm_${userId}`)
            .setLabel('확인')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId(`recurrence_cancel_${userId}`)
            .setLabel('취소')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );

    await interaction.update({
        embeds: [embed],
        components: [buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 사용자 정의 반복 모달
 */
async function showCustomRecurrenceModal(interaction) {
    const modal = new ModalBuilder()
        .setCustomId(`recurrence_custom_modal_${interaction.user.id}`)
        .setTitle('🔁 사용자 정의 반복 설정');

    const intervalInput = new TextInputBuilder()
        .setCustomId('interval')
        .setLabel('반복 간격 (일 단위)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 7 (매주), 14 (격주)')
        .setRequired(true)
        .setValue('7')
        .setMaxLength(3);

    const daysInput = new TextInputBuilder()
        .setCustomId('daysOfWeek')
        .setLabel('요일 선택 (선택사항, 쉼표로 구분)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 월,수,금')
        .setRequired(false)
        .setMaxLength(50);

    const endDateInput = new TextInputBuilder()
        .setCustomId('endDate')
        .setLabel('종료일 (선택사항)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 2025-12-31')
        .setRequired(false)
        .setMaxLength(10);

    const occurrencesInput = new TextInputBuilder()
        .setCustomId('occurrences')
        .setLabel('반복 횟수 (선택사항)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 10 (10회 반복 후 종료)')
        .setRequired(false)
        .setMaxLength(3);

    modal.addComponents(
        new ActionRowBuilder().addComponents(intervalInput),
        new ActionRowBuilder().addComponents(daysInput),
        new ActionRowBuilder().addComponents(endDateInput),
        new ActionRowBuilder().addComponents(occurrencesInput)
    );

    await interaction.showModal(modal);
}

/**
 * 반복 설정 미리보기
 */
export async function handleRecurrencePreview(interaction) {
    const userId = interaction.user.id;
    const session = recurrenceSessions.get(userId);

    if (!session || !session.pattern) {
        await interaction.reply({
            content: '❌ 먼저 반복 패턴을 선택해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const meetingTime = getPendingMeetingTime(userId);
    if (!meetingTime) {
        await interaction.reply({
            content: '❌ 회의 시간이 설정되지 않았습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const dates = generateDetailedPreview(session.pattern, meetingTime, session.options, 10);

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📅 반복 회의 일정 미리보기')
        .setDescription(`**${formatRecurrencePattern(session.pattern, session.options)}** 패턴`)
        .addFields({
            name: '📆 예정된 회의 일정',
            value: dates,
            inline: false
        })
        .setFooter({ text: '이 일정으로 진행하시겠습니까?' })
        .setTimestamp();

    await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 반복 설정 확인 및 안건 생성
 */
export async function handleRecurrenceConfirm(interaction) {
    const userId = interaction.user.id;
    const session = recurrenceSessions.get(userId);

    if (!session || !session.pattern) {
        await interaction.reply({
            content: '❌ 반복 설정이 완료되지 않았습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await finalizeAgenda(interaction, session);
}

/**
 * 최종 안건 생성
 */
async function finalizeAgenda(interaction, recurrenceSession) {
    const userId = interaction.user.id;

    // 임시 저장 데이터 가져오기
    const title = getPendingTitle(userId);
    const meetingTime = getPendingMeetingTime(userId);
    const reminderPolicy = getPendingReminderPolicy(userId);

    if (!title) {
        await interaction.reply({
            content: '❌ 안건 제목이 설정되지 않았습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // 안건 생성 로직 (기존 addAgendaHandler의 최종 제출 부분과 통합)
    const { handleAddAgendaModal } = await import('./addAgendaHandler.js');

    // recurrenceSession이 있으면 반복 회의로 생성
    if (recurrenceSession) {
        // 반복 회의 생성
        const topicData = {
            guild_id: interaction.guildId,
            channel_id: interaction.channelId,
            message_id: null, // 나중에 설정
            title: title,
            created_by: interaction.user.username,
            thread_id: null, // 나중에 설정
            meeting_date: meetingTime,
            reminder_policy: reminderPolicy
        };

        const recurrenceOptions = {
            pattern: recurrenceSession.pattern,
            ...recurrenceSession.options
        };

        // 반복 회의 생성
        const { createRecurringMeeting } = await import('../services/recurringMeetingService.js');
        const topic = await createRecurringMeeting(topicData, recurrenceOptions);

        // 다음 몇 개의 인스턴스 미리 생성
        await preGenerateRecurringMeetings(topic.id, 3);

        await interaction.update({
            content: `✅ 반복 회의가 생성되었습니다! (안건 #${topic.id})`,
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
    } else {
        // 일반 안건으로 생성 (기존 로직)
        await interaction.update({
            content: '✅ 안건을 생성하는 중...',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
    }

    // 임시 데이터 정리
    clearAllPending(userId);
    recurrenceSessions.delete(userId);
}

/**
 * 반복 패턴 설명 생성
 */
function formatRecurrenceDescription(pattern) {
    switch (pattern) {
        case RecurrencePattern.WEEKLY:
            return '매주 같은 요일에 회의가 반복됩니다.';
        case RecurrencePattern.BIWEEKLY:
            return '2주마다 같은 요일에 회의가 반복됩니다.';
        case RecurrencePattern.MONTHLY:
            return '매월 같은 날짜에 회의가 반복됩니다.';
        case RecurrencePattern.QUARTERLY:
            return '3개월마다 회의가 반복됩니다.';
        default:
            return '사용자가 정의한 패턴으로 반복됩니다.';
    }
}

/**
 * 미리보기 날짜 생성
 */
function generatePreviewDates(pattern, count = 3) {
    const { calculateNextMeetingDate } = require('../services/recurringMeetingService.js');
    const dates = [];
    let currentDate = getPendingMeetingTime(interaction.user.id) || Date.now();

    for (let i = 0; i < count; i++) {
        currentDate = calculateNextMeetingDate(currentDate, pattern);
        dates.push(`• ${new Date(currentDate).toLocaleString('ko-KR')}`);
    }

    return dates.join('\n');
}

/**
 * 상세 미리보기 생성
 */
function generateDetailedPreview(pattern, startDate, options = {}, count = 10) {
    const { calculateNextMeetingDate } = require('../services/recurringMeetingService.js');
    const dates = [];
    let currentDate = startDate;

    for (let i = 0; i < count; i++) {
        currentDate = calculateNextMeetingDate(currentDate, pattern, options);

        // 종료일 체크
        if (options.endDate && currentDate > options.endDate) {
            dates.push(`📛 종료일 도달 (${new Date(options.endDate).toLocaleDateString('ko-KR')})`);
            break;
        }

        dates.push(`${i + 1}. ${new Date(currentDate).toLocaleString('ko-KR')}`);
    }

    return dates.join('\n');
}