import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} from 'discord.js';
import {
    getPendingReminders,
    getRemindersByTopic,
    markReminderDelivered,
    updateReminderSchedule,
    getTopic
} from '../db/database.js';
import { snapToKST9AM } from '../utils/timeUtils.js';

// 세션 저장소
const reminderSessions = new Map();

/**
 * 다음 영업일 계산 (주말 제외)
 */
function getNextBusinessDay() {
    const date = new Date();
    date.setDate(date.getDate() + 1); // 내일부터 시작

    // 주말이면 다음 월요일로
    while (date.getDay() === 0 || date.getDay() === 6) {
        date.setDate(date.getDate() + 1);
    }

    // 오전 10시로 설정
    date.setHours(10, 0, 0, 0);
    return date.getTime();
}

// 필터 레이블 매핑
const FILTER_LABELS = {
    'today': '📅 오늘',
    'tomorrow': '📆 내일',
    'week': '📅 7일 이내',
    'snoozed': '⏰ 스누즈',
    'delivered': '✅ 전송 완료',
    'all': '📋 전체'
};

/**
 * 필터에 따른 리마인더 조회
 */
async function getFilteredReminders(guildId, filter) {
    const now = Date.now();
    const tomorrow = snapToKST9AM(new Date(), 1);
    const week = now + (7 * 24 * 60 * 60 * 1000);

    // 모든 리마인더 가져오기
    const allReminders = getPendingReminders(now + (30 * 24 * 60 * 60 * 1000)); // 30일치

    // 길드 필터링
    const guildReminders = allReminders.filter(r => r.guild_id === guildId);

    switch (filter) {
        case 'today':
            return guildReminders.filter(r =>
                r.scheduled_at <= tomorrow && !r.delivered_at
            );
        case 'tomorrow':
            return guildReminders.filter(r =>
                r.scheduled_at > tomorrow &&
                r.scheduled_at <= tomorrow + (24 * 60 * 60 * 1000) &&
                !r.delivered_at
            );
        case 'week':
            return guildReminders.filter(r =>
                r.scheduled_at <= week && !r.delivered_at
            );
        case 'snoozed':
            return guildReminders.filter(r =>
                r.retry_count > 0 && !r.delivered_at
            );
        case 'delivered':
            return guildReminders.filter(r => r.delivered_at);
        default:
            return guildReminders;
    }
}

/**
 * 리마인더 대시보드 표시
 */
export async function showReminderDashboard(interaction, filter = 'today', page = 0) {
    const isUpdate = interaction.deferred || interaction.replied;
    if (!isUpdate) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    // 세션 데이터 관리
    const session = reminderSessions.get(interaction.user.id) || {};
    session.filter = filter;
    session.page = page;
    session.selected = session.selected || [];
    reminderSessions.set(interaction.user.id, session);

    // 필터링된 리마인더 가져오기
    const allReminders = await getFilteredReminders(interaction.guildId, filter);
    const pageSize = 10;
    const totalPages = Math.ceil(allReminders.length / pageSize);
    const startIdx = page * pageSize;
    const reminders = allReminders.slice(startIdx, startIdx + pageSize);

    // Embed 생성
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔔 리마인더 대시보드')
        .setDescription(`${FILTER_LABELS[filter]} 리마인더 목록`)
        .addFields(
            {
                name: '📊 통계',
                value: `전체: ${allReminders.length}개 | 페이지: ${page + 1}/${totalPages || 1}`,
                inline: false
            }
        )
        .setTimestamp();

    // 리마인더 목록 추가
    if (reminders.length > 0) {
        const reminderList = await Promise.all(reminders.map(async (r, idx) => {
            const topic = getTopic(r.topic_id);
            const time = new Date(r.scheduled_at);
            const isSelected = session.selected.includes(r.id);
            const status = r.delivered_at ? '✅' : (r.retry_count > 0 ? '⏰' : '📋');

            return `${isSelected ? '☑️' : '⬜'} ${status} **#${topic?.id || r.topic_id}** - ${topic?.title || '제목 없음'}\n` +
                   `└ ${time.toLocaleString('ko-KR')} | ${r.type}`;
        }));

        embed.addFields({
            name: '📋 리마인더 목록',
            value: reminderList.join('\n\n').substring(0, 1024),
            inline: false
        });
    } else {
        embed.addFields({
            name: '📋 리마인더 목록',
            value: '표시할 리마인더가 없습니다.',
            inline: false
        });
    }

    // 선택된 항목 표시
    if (session.selected.length > 0) {
        embed.addFields({
            name: '✅ 선택된 항목',
            value: `${session.selected.length}개 선택됨`,
            inline: true
        });
    }

    // 컴포넌트 생성
    const components = [];

    // 필터 버튼
    const filterRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reminder_filter_today')
            .setLabel('오늘')
            .setStyle(filter === 'today' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('📅'),
        new ButtonBuilder()
            .setCustomId('reminder_filter_tomorrow')
            .setLabel('내일')
            .setStyle(filter === 'tomorrow' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('📆'),
        new ButtonBuilder()
            .setCustomId('reminder_filter_week')
            .setLabel('7일')
            .setStyle(filter === 'week' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('📅'),
        new ButtonBuilder()
            .setCustomId('reminder_filter_snoozed')
            .setLabel('스누즈')
            .setStyle(filter === 'snoozed' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('⏰'),
        new ButtonBuilder()
            .setCustomId('reminder_filter_delivered')
            .setLabel('전송됨')
            .setStyle(filter === 'delivered' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setEmoji('✅')
    );
    components.push(filterRow);

    // 페이지네이션 및 선택 버튼
    if (reminders.length > 0) {
        const pageRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('reminder_page_prev')
                .setLabel('이전')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬅️')
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId('reminder_select_all')
                .setLabel('모두 선택')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('☑️'),
            new ButtonBuilder()
                .setCustomId('reminder_select_none')
                .setLabel('선택 해제')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬜')
                .setDisabled(session.selected.length === 0),
            new ButtonBuilder()
                .setCustomId('reminder_page_next')
                .setLabel('다음')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('➡️')
                .setDisabled(page >= totalPages - 1)
        );
        components.push(pageRow);

        // 선택 메뉴 (개별 선택)
        if (reminders.length > 0) {
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('reminder_select_items')
                .setPlaceholder('리마인더를 선택하세요 (복수 선택 가능)')
                .setMinValues(0)
                .setMaxValues(Math.min(reminders.length, 10));

            reminders.forEach(r => {
                const topic = getTopic(r.topic_id);
                selectMenu.addOptions({
                    label: `#${topic?.id || r.topic_id} - ${(topic?.title || '제목 없음').substring(0, 50)}`,
                    description: new Date(r.scheduled_at).toLocaleString('ko-KR').substring(0, 50),
                    value: r.id.toString(),
                    default: session.selected.includes(r.id)
                });
            });

            const selectRow = new ActionRowBuilder().addComponents(selectMenu);
            components.push(selectRow);
        }
    }

    // 액션 버튼 (두 줄로 분리)
    const actionRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reminder_snooze_30m')
            .setLabel('+30분')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏱️')
            .setDisabled(session.selected.length === 0),
        new ButtonBuilder()
            .setCustomId('reminder_snooze_1h')
            .setLabel('+1시간')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⏰')
            .setDisabled(session.selected.length === 0),
        new ButtonBuilder()
            .setCustomId('reminder_snooze_2h')
            .setLabel('+2시간')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🕐')
            .setDisabled(session.selected.length === 0),
        new ButtonBuilder()
            .setCustomId('reminder_snooze_tomorrow')
            .setLabel('내일 9시')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🌅')
            .setDisabled(session.selected.length === 0),
        new ButtonBuilder()
            .setCustomId('reminder_snooze_next_business')
            .setLabel('다음 영업일')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💼')
            .setDisabled(session.selected.length === 0)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reminder_delete_selected')
            .setLabel('삭제')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(session.selected.length === 0),
        new ButtonBuilder()
            .setCustomId('reminder_main_menu')
            .setLabel('메인 메뉴')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🏠')
    );

    components.push(actionRow1, actionRow2);

    // 응답 전송
    const response = {
        embeds: [embed],
        components: components
    };

    if (isUpdate) {
        await interaction.editReply(response);
    } else {
        await interaction.followUp(response);
    }
}

/**
 * 필터 버튼 처리
 */
export async function handleFilterButton(interaction) {
    const filter = interaction.customId.replace('reminder_filter_', '');
    const session = reminderSessions.get(interaction.user.id) || {};
    await showReminderDashboard(interaction, filter, 0);
}

/**
 * 페이지네이션 처리
 */
export async function handlePageButton(interaction) {
    const session = reminderSessions.get(interaction.user.id) || {};
    const direction = interaction.customId === 'reminder_page_next' ? 1 : -1;
    const newPage = Math.max(0, session.page + direction);
    await showReminderDashboard(interaction, session.filter, newPage);
}

/**
 * 선택 처리
 */
export async function handleSelectItems(interaction) {
    const session = reminderSessions.get(interaction.user.id) || {};
    session.selected = interaction.values.map(v => parseInt(v));
    reminderSessions.set(interaction.user.id, session);
    await showReminderDashboard(interaction, session.filter, session.page);
}

/**
 * 모두 선택/해제
 */
export async function handleSelectAll(interaction) {
    const session = reminderSessions.get(interaction.user.id) || {};
    const allReminders = await getFilteredReminders(interaction.guildId, session.filter);
    const pageSize = 10;
    const startIdx = session.page * pageSize;
    const reminders = allReminders.slice(startIdx, startIdx + pageSize);

    if (interaction.customId === 'reminder_select_all') {
        session.selected = [...new Set([...session.selected, ...reminders.map(r => r.id)])];
    } else {
        session.selected = [];
    }

    reminderSessions.set(interaction.user.id, session);
    await showReminderDashboard(interaction, session.filter, session.page);
}

/**
 * 일괄 스누즈 처리
 */
export async function handleBulkSnooze(interaction) {
    const session = reminderSessions.get(interaction.user.id) || {};
    if (session.selected.length === 0) return;

    await interaction.deferUpdate();

    const snoozeType = interaction.customId.replace('reminder_snooze_', '');
    let newTime;
    let description = '';

    // 스누즈할 아이템 수 저장
    const count = session.selected.length;

    for (const reminderId of session.selected) {
        const now = Date.now();

        switch(snoozeType) {
            case '30m':
                newTime = now + (30 * 60 * 1000);
                description = '30분 후';
                break;
            case '1h':
                newTime = now + (60 * 60 * 1000);
                description = '1시간 후';
                break;
            case '2h':
                newTime = now + (2 * 60 * 60 * 1000);
                description = '2시간 후';
                break;
            case 'tomorrow':
                newTime = snapToKST9AM(new Date(), 1);
                description = '내일 오전 9시';
                break;
            case 'next_business':
                newTime = getNextBusinessDay();
                description = '다음 영업일 오전 10시';
                break;
            default:
                newTime = now + (60 * 60 * 1000);
                description = '1시간 후';
        }

        await updateReminderSchedule(reminderId, newTime);
    }

    // 선택 초기화
    session.selected = [];
    reminderSessions.set(interaction.user.id, session);

    // 성공 메시지와 함께 대시보드 새로고침
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ 스누즈 완료')
        .setDescription(`${count}개의 리마인더가 **${description}**로 스누즈되었습니다.`)
        .addFields({
            name: '⏰ 새로운 알림 시간',
            value: new Date(newTime).toLocaleString('ko-KR'),
            inline: false
        })
        .setTimestamp();

    await interaction.followUp({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });

    await showReminderDashboard(interaction, session.filter, session.page);
}

/**
 * 일괄 삭제 처리
 */
export async function handleBulkDelete(interaction) {
    const session = reminderSessions.get(interaction.user.id) || {};
    if (session.selected.length === 0) return;

    await interaction.deferUpdate();

    for (const reminderId of session.selected) {
        await markReminderDelivered(reminderId);
    }

    // 선택 초기화
    const count = session.selected.length;
    session.selected = [];
    reminderSessions.set(interaction.user.id, session);

    // 성공 메시지와 함께 대시보드 새로고침
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('🗑️ 삭제 완료')
        .setDescription(`${count}개의 리마인더가 삭제되었습니다.`)
        .setTimestamp();

    await interaction.followUp({
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });

    await showReminderDashboard(interaction, session.filter, session.page);
}