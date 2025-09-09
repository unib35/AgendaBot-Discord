import { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    MessageFlags 
} from 'discord.js';
import {
    generateStats,
    showDetailedStats,
    showCompareMenu,
    postStatsToChannel,
    statsSessions
} from '../commands/stats.js';

/**
 * 오늘 통계
 */
export async function handleStatsToday(interaction) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    await generateStats(interaction, today, tomorrow, `오늘 (${formatDate(today)})`);
}

/**
 * 이번 주 통계
 */
export async function handleStatsThisWeek(interaction) {
    const now = new Date();
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    
    await generateStats(
        interaction, 
        weekStart, 
        weekEnd, 
        `이번 주 (${formatDate(weekStart)} ~ ${formatDate(new Date(weekEnd.getTime() - 1))})`
    );
}

/**
 * 이번 달 통계
 */
export async function handleStatsThisMonth(interaction) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    await generateStats(
        interaction, 
        monthStart, 
        monthEnd, 
        `이번 달 (${formatDate(monthStart)} ~ ${formatDate(new Date(monthEnd.getTime() - 1))})`
    );
}

/**
 * 올해 통계
 */
export async function handleStatsThisYear(interaction) {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
    
    await generateStats(
        interaction, 
        yearStart, 
        yearEnd, 
        `올해 (${now.getFullYear()}년)`
    );
}

/**
 * 지난 7일 통계
 */
export async function handleStatsLast7Days(interaction) {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    await generateStats(
        interaction, 
        sevenDaysAgo, 
        now, 
        `지난 7일 (${formatDate(sevenDaysAgo)} ~ ${formatDate(now)})`
    );
}

/**
 * 지난 30일 통계
 */
export async function handleStatsLast30Days(interaction) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    await generateStats(
        interaction, 
        thirtyDaysAgo, 
        now, 
        `지난 30일 (${formatDate(thirtyDaysAgo)} ~ ${formatDate(now)})`
    );
}

/**
 * 전체 기간 통계
 */
export async function handleStatsAllTime(interaction) {
    const startDate = new Date(2020, 0, 1); // 충분히 과거 날짜
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 1); // 오늘 포함
    
    await generateStats(
        interaction, 
        startDate, 
        endDate, 
        '전체 기간'
    );
}

/**
 * 사용자 지정 기간 모달 표시
 */
export async function handleStatsCustom(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('stats_custom_modal')
        .setTitle('사용자 지정 기간');
    
    const startInput = new TextInputBuilder()
        .setCustomId('stats_start_date')
        .setLabel('시작일')
        .setPlaceholder('YYYY-MM-DD (예: 2024-01-01)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10)
        .setMinLength(10);
    
    const endInput = new TextInputBuilder()
        .setCustomId('stats_end_date')
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
export async function handleStatsCustomModal(interaction) {
    const startDateStr = interaction.fields.getTextInputValue('stats_start_date');
    const endDateStr = interaction.fields.getTextInputValue('stats_end_date');
    
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
    await generateStats(
        interaction, 
        startDate, 
        endDateInclusive, 
        `사용자 지정 (${formatDate(startDate)} ~ ${formatDate(endDate)})`
    );
}

/**
 * 기간 비교
 */
export async function handleStatsCompare(interaction) {
    await showCompareMenu(interaction);
}

/**
 * 이번 주 vs 지난 주 비교
 */
export async function handleStatsCompareWeek(interaction) {
    const now = new Date();
    const thisWeekStart = getWeekStart(now);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
    
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    
    // 먼저 이번 주 통계 생성
    await generateStats(
        interaction,
        thisWeekStart,
        thisWeekEnd,
        `이번 주 vs 지난 주 비교`,
        '지난 주 대비 분석 중...'
    );
    
    // TODO: 비교 로직 구현
}

/**
 * 이번 달 vs 지난 달 비교
 */
export async function handleStatsCompareMonth(interaction) {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // 먼저 이번 달 통계 생성
    await generateStats(
        interaction,
        thisMonthStart,
        thisMonthEnd,
        `이번 달 vs 지난 달 비교`,
        '지난 달 대비 분석 중...'
    );
    
    // TODO: 비교 로직 구현
}

/**
 * 통계 취소
 */
export async function handleStatsCancel(interaction) {
    // 세션 정리
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    statsSessions.delete(sessionKey);
    
    await interaction.update({
        content: '❌ 통계 조회가 취소되었습니다.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 메인 메뉴로 돌아가기
 */
export async function handleStatsBack(interaction) {
    // 통계 메뉴 embed와 버튼들 다시 생성
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = await import('discord.js');
    
    // 현재 날짜 계산
    const now = new Date();
    const today = formatDate(now);
    
    // 이번 주 날짜 계산
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // 이번 달 날짜 계산
    const monthStart = getMonthStart(now);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    // 올해 날짜 계산
    const yearStart = getYearStart(now);
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 통계 대시보드')
        .setDescription('확인하고 싶은 통계 기간을 선택하세요.')
        .addFields(
            { 
                name: '📈 빠른 통계', 
                value: '자주 사용하는 기간의 통계를 빠르게 확인할 수 있습니다.', 
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
                name: '이번 달', 
                value: `${formatDate(monthStart)} ~ ${formatDate(monthEnd)}`, 
                inline: true 
            },
            { 
                name: '지난 7일', 
                value: '최근 일주일간 통계', 
                inline: true 
            },
            { 
                name: '지난 30일', 
                value: '최근 한 달간 통계', 
                inline: true 
            },
            { 
                name: '올해', 
                value: `${formatDate(yearStart)} ~ ${formatDate(yearEnd)}`, 
                inline: true 
            }
        )
        .setFooter({ text: '📊 실시간 통계 데이터' })
        .setTimestamp();
    
    // 빠른 통계 버튼들 (첫 번째 줄)
    const quickButtons1 = [
        new ButtonBuilder()
            .setCustomId('stats_today')
            .setLabel('오늘')
            .setEmoji('📅')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('stats_this_week')
            .setLabel('이번 주')
            .setEmoji('📆')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('stats_this_month')
            .setLabel('이번 달')
            .setEmoji('🗓️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('stats_this_year')
            .setLabel('올해')
            .setEmoji('📅')
            .setStyle(ButtonStyle.Primary)
    ];
    
    // 빠른 통계 버튼들 (두 번째 줄)
    const quickButtons2 = [
        new ButtonBuilder()
            .setCustomId('stats_last_7days')
            .setLabel('지난 7일')
            .setEmoji('7️⃣')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('stats_last_30days')
            .setLabel('지난 30일')
            .setEmoji('📆')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('stats_all_time')
            .setLabel('전체 기간')
            .setEmoji('♾️')
            .setStyle(ButtonStyle.Secondary)
    ];
    
    // 고급 옵션 버튼들
    const advancedButtons = [
        new ButtonBuilder()
            .setCustomId('stats_custom')
            .setLabel('사용자 지정 기간')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('stats_compare')
            .setLabel('기간 비교')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('stats_export')
            .setLabel('내보내기')
            .setEmoji('💾')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true), // 추후 구현
        new ButtonBuilder()
            .setCustomId('stats_cancel')
            .setLabel('취소')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    ];
    
    const components = [
        new ActionRowBuilder().addComponents(quickButtons1),
        new ActionRowBuilder().addComponents(quickButtons2),
        new ActionRowBuilder().addComponents(advancedButtons)
    ];
    
    await interaction.update({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 통계 결과로 돌아가기
 */
export async function handleStatsBackToResult(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = statsSessions.get(sessionKey);
    
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
            .setCustomId('stats_detail')
            .setLabel('상세 보기')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('stats_chart')
            .setLabel('차트 보기')
            .setEmoji('📊')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('stats_post')
            .setLabel('채널에 게시')
            .setEmoji('📤')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('stats_back')
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
 * 상세 통계 보기
 */
export async function handleStatsDetail(interaction) {
    await showDetailedStats(interaction);
}

/**
 * 통계 게시
 */
export async function handleStatsPost(interaction) {
    await postStatsToChannel(interaction);
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

function getYearStart(date) {
    return new Date(date.getFullYear(), 0, 1);
}

function parseDate(s) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!match) return null;
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
}