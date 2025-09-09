import { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    MessageFlags 
} from 'discord.js';
import {
    generateSummary,
    postSummaryToChannel,
    showFilterMenu,
    applyFilter,
    summarySessions
} from '../commands/summary.js';

/**
 * 오늘 요약
 */
export async function handleSummaryToday(interaction) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    await generateSummary(interaction, today, tomorrow, `오늘 (${formatDate(today)})`);
}

/**
 * 이번 주 요약
 */
export async function handleSummaryThisWeek(interaction) {
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    await generateSummary(
        interaction, 
        weekStart, 
        weekEnd, 
        `이번 주 (${formatDate(weekStart)} ~ ${formatDate(new Date(weekEnd.getTime() - 1))})`
    );
}

/**
 * 지난 주 요약
 */
export async function handleSummaryLastWeek(interaction) {
    const now = new Date();
    const weekStart = getWeekStart(now);
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);
    
    await generateSummary(
        interaction, 
        lastWeekStart, 
        lastWeekEnd, 
        `지난 주 (${formatDate(lastWeekStart)} ~ ${formatDate(new Date(lastWeekEnd.getTime() - 1))})`
    );
}

/**
 * 이번 달 요약
 */
export async function handleSummaryThisMonth(interaction) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    await generateSummary(
        interaction, 
        monthStart, 
        monthEnd, 
        `이번 달 (${formatDate(monthStart)} ~ ${formatDate(new Date(monthEnd.getTime() - 1))})`
    );
}

/**
 * 사용자 지정 기간 모달 표시
 */
export async function handleSummaryCustom(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('summary_custom_modal')
        .setTitle('사용자 지정 기간');
    
    const startInput = new TextInputBuilder()
        .setCustomId('summary_start_date')
        .setLabel('시작일')
        .setPlaceholder('YYYY-MM-DD (예: 2024-01-01)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
        .setMinLength(10);
    
    const endInput = new TextInputBuilder()
        .setCustomId('summary_end_date')
        .setLabel('종료일')
        .setPlaceholder('YYYY-MM-DD (예: 2024-01-31)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
        .setMinLength(10);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(startInput),
        new ActionRowBuilder().addComponents(endInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 사용자 지정 기간 모달 처리
 */
export async function handleSummaryCustomModal(interaction) {
    const startDateStr = interaction.fields.getTextInputValue('summary_start_date');
    const endDateStr = interaction.fields.getTextInputValue('summary_end_date');
    
    // 날짜 유효성 검사
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);
    
    if (!startDate || !endDate) {
        await interaction.reply({
            content: '❌ 올바른 날짜 형식이 아닙니다. YYYY-MM-DD 형식으로 입력해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    if (startDate >= endDate) {
        await interaction.reply({
            content: '❌ 시작일은 종료일보다 이전이어야 합니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 종료일을 다음날 0시로 설정 (해당일 포함)
    const endDateInclusive = new Date(endDate);
    endDateInclusive.setDate(endDateInclusive.getDate() + 1);
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await generateSummary(
        interaction, 
        startDate, 
        endDateInclusive, 
        `사용자 지정 (${formatDate(startDate)} ~ ${formatDate(endDate)})`
    );
}

/**
 * 요약 취소
 */
export async function handleSummaryCancel(interaction) {
    // 세션 정리
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    summarySessions.delete(sessionKey);
    
    await interaction.update({
        content: '❌ 요약 생성이 취소되었습니다.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 메인 메뉴로 돌아가기
 */
export async function handleSummaryBack(interaction) {
    // 요약 메뉴 embed와 버튼들 다시 생성
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = await import('discord.js');
    
    // 현재 날짜 계산
    const now = new Date();
    const today = formatDate(now);
    
    // 이번 주 날짜 계산
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // 지난 주 날짜 계산
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
    
    // 이번 달 날짜 계산
    const monthStart = getMonthStart(now);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 AI 요약 생성')
        .setDescription('요약할 기간을 선택하세요.')
        .addFields(
            { 
                name: '🗓️ 빠른 선택', 
                value: '자주 사용하는 기간을 빠르게 선택할 수 있습니다.', 
                inline: false 
            },
            { 
                name: '오늘', 
                value: today, 
                inline: true 
            },
            { 
                name: '이번 주', 
                value: `${formatDate(weekStart)} ~ ${formatDate(weekEnd)}`, 
                inline: true 
            },
            { 
                name: '지난 주', 
                value: `${formatDate(lastWeekStart)} ~ ${formatDate(lastWeekEnd)}`, 
                inline: true 
            },
            { 
                name: '이번 달', 
                value: `${formatDate(monthStart)} ~ ${formatDate(monthEnd)}`, 
                inline: true 
            }
        )
        .setFooter({ text: 'Powered by Gemini AI' })
        .setTimestamp();
    
    // 빠른 선택 버튼들
    const quickButtons = [
        new ButtonBuilder()
            .setCustomId('summary_today')
            .setLabel('오늘')
            .setEmoji('📅')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('summary_this_week')
            .setLabel('이번 주')
            .setEmoji('📆')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('summary_last_week')
            .setLabel('지난 주')
            .setEmoji('📆')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('summary_this_month')
            .setLabel('이번 달')
            .setEmoji('🗓️')
            .setStyle(ButtonStyle.Primary)
    ];
    
    // 커스텀 기간 및 취소 버튼
    const customButtons = [
        new ButtonBuilder()
            .setCustomId('summary_custom')
            .setLabel('사용자 지정 기간')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('summary_cancel')
            .setLabel('취소')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    ];
    
    const components = [
        new ActionRowBuilder().addComponents(quickButtons),
        new ActionRowBuilder().addComponents(customButtons)
    ];
    
    await interaction.update({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 요약 결과로 돌아가기
 */
export async function handleSummaryBackToResult(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = summarySessions.get(sessionKey);
    
    if (!session) {
        await interaction.update({
            content: '❌ 세션이 만료되었습니다. 다시 시도해주세요.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    
    const actionButtons = [
        new ButtonBuilder()
            .setCustomId('summary_post')
            .setLabel('채널에 게시')
            .setEmoji('📤')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('summary_export')
            .setLabel('내보내기')
            .setEmoji('💾')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('summary_filter')
            .setLabel('필터링')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('summary_back')
            .setLabel('뒤로')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
    ];
    
    await interaction.update({
        embeds: [session.embed],
        components: [new ActionRowBuilder().addComponents(actionButtons)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 요약 게시
 */
export async function handleSummaryPost(interaction) {
    await postSummaryToChannel(interaction);
}

/**
 * 필터 메뉴 표시
 */
export async function handleSummaryFilter(interaction) {
    await showFilterMenu(interaction);
}

/**
 * 필터 선택 처리
 */
export async function handleSummaryFilterSelect(interaction) {
    const status = interaction.values[0];
    await applyFilter(interaction, status);
}

/**
 * 필터 취소
 */
export async function handleSummaryFilterCancel(interaction) {
    await handleSummaryBackToResult(interaction);
}

// 헬퍼 함수들
function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // 월요일 시작
    d.setDate(d.getDate() + diff);
    return d;
}

function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function parseDate(s) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!match) return null;
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
}