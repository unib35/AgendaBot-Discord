import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags 
} from 'discord.js';
import { 
    getTopicsBetween, 
    getTopics,
    getGuildSettings 
} from '../db/database.js';
import { ensurePermissions } from '../utils/guards.js';

// 세션 저장소
export const statsSessions = new Map();

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 월요일 시작
    return new Date(d.setDate(diff));
}

function getMonthStart(date) {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getYearStart(date) {
    const d = new Date(date);
    return new Date(d.getFullYear(), 0, 1);
}

const STATUS_EMOJIS = {
    '진행중': '🔄',
    '완료': '✅',
    '보류': '⏸️',
    '취소': '❌',
    '검토중': '🔍',
    '대기중': '⏸️'
};

export default {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('📊 통계 대시보드 - 안건 분석 및 통계'),

    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // 메인 메뉴 표시
        await showStatsMenu(interaction);
    }
};

/**
 * 통계 메인 메뉴 표시
 */
export async function showStatsMenu(interaction) {
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
    
    await interaction.editReply({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 통계 생성 및 표시
 */
export async function generateStats(interaction, startDate, endDate, label, comparison = null) {
    // 로딩 메시지
    const loadingEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⏳ 통계 생성 중...')
        .setDescription(`**${label}**\n\n데이터를 분석하고 있습니다...`)
        .setTimestamp();
    
    await interaction.update({
        embeds: [loadingEmbed],
        components: [],
        flags: MessageFlags.Ephemeral
    });
    
    try {
        // 시간을 timestamp로 변환 (초 단위)
        const startTimestamp = Math.floor(startDate.getTime() / 1000);
        const endTimestamp = Math.floor(endDate.getTime() / 1000);
        
        // 안건 조회
        const topics = getTopicsBetween(interaction.guildId, startTimestamp, endTimestamp);
        
        // 상태별 통계
        const statusCount = {};
        let newCount = 0;
        let completedInPeriod = 0;
        const userStats = {};
        const dailyStats = {};
        
        for (const topic of topics) {
            // 상태별 카운트
            statusCount[topic.status] = (statusCount[topic.status] || 0) + 1;
            
            // 기간 내 신규 생성
            if (topic.created_at >= startTimestamp && topic.created_at < endTimestamp) {
                newCount++;
                
                // 일별 통계
                const date = new Date(topic.created_at * 1000);
                const dateKey = formatDate(date);
                dailyStats[dateKey] = (dailyStats[dateKey] || { created: 0, completed: 0 });
                dailyStats[dateKey].created++;
            }
            
            // 기간 내 완료
            if (topic.status === '완료' && topic.updated_at >= startTimestamp && topic.updated_at < endTimestamp) {
                completedInPeriod++;
                
                // 일별 완료 통계
                const date = new Date(topic.updated_at * 1000);
                const dateKey = formatDate(date);
                dailyStats[dateKey] = (dailyStats[dateKey] || { created: 0, completed: 0 });
                dailyStats[dateKey].completed++;
            }
            
            // 사용자별 통계
            userStats[topic.created_by] = (userStats[topic.created_by] || 0) + 1;
        }
        
        // 완료율 계산
        const completionRate = topics.length > 0 
            ? Math.round((statusCount['완료'] || 0) / topics.length * 100)
            : 0;
        
        // 평균 일일 생성률
        const daysDiff = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
        const avgDaily = (newCount / daysDiff).toFixed(1);
        
        // 진행률 바 생성
        const progressBar = createProgressBar(completionRate);
        
        // 결과 Embed 생성
        const resultEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📊 통계 분석 결과')
            .setDescription(`**${label}**`)
            .addFields(
                {
                    name: '📈 핵심 지표',
                    value: [
                        `**총 안건**: ${topics.length}개`,
                        `**신규 등록**: ${newCount}개`,
                        `**기간 내 완료**: ${completedInPeriod}개`,
                        `**완료율**: ${completionRate}% ${progressBar}`,
                        `**일평균 생성**: ${avgDaily}개`
                    ].join('\n'),
                    inline: false
                }
            );
        
        // 상태별 분포
        if (Object.keys(statusCount).length > 0) {
            const statusFields = Object.entries(statusCount)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => {
                    const emoji = STATUS_EMOJIS[status] || '📌';
                    const percent = topics.length > 0 ? Math.round((count / topics.length) * 100) : 0;
                    return `${emoji} ${status}: **${count}개** (${percent}%)`;
                });
            
            resultEmbed.addFields({
                name: '🎯 상태별 분포',
                value: statusFields.join('\n') || '데이터 없음',
                inline: true
            });
        }
        
        // TOP 기여자
        if (Object.keys(userStats).length > 0) {
            const topUsers = Object.entries(userStats)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([userId, count], index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤';
                    return `${medal} <@${userId}>: ${count}개`;
                });
            
            resultEmbed.addFields({
                name: '🏆 TOP 기여자',
                value: topUsers.join('\n'),
                inline: true
            });
        }
        
        // 트렌드 (최근 7일 데이터가 있을 경우)
        const recentDays = Object.keys(dailyStats).sort().slice(-7);
        if (recentDays.length > 0) {
            const trendData = recentDays.map(date => {
                const stats = dailyStats[date];
                return `${date.substring(5)}: 📝${stats.created} ✅${stats.completed}`;
            });
            
            resultEmbed.addFields({
                name: '📉 최근 트렌드',
                value: trendData.slice(-5).join('\n') || '데이터 없음',
                inline: false
            });
        }
        
        // 비교 데이터가 있으면 추가
        if (comparison) {
            resultEmbed.addFields({
                name: '🔄 이전 기간 대비',
                value: comparison,
                inline: false
            });
        }
        
        resultEmbed
            .setFooter({ text: '📊 실시간 통계 데이터' })
            .setTimestamp();
        
        // 세션에 결과 저장
        const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
        statsSessions.set(sessionKey, {
            embed: resultEmbed,
            topics: topics,
            label: label,
            startDate: startDate,
            endDate: endDate,
            stats: {
                statusCount,
                newCount,
                completedInPeriod,
                userStats,
                dailyStats
            }
        });
        
        // 액션 버튼들
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
                .setDisabled(true), // 추후 구현
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
        
        await interaction.editReply({
            embeds: [resultEmbed],
            components: [new ActionRowBuilder().addComponents(actionButtons)],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('통계 생성 중 오류:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ 오류 발생')
            .setDescription('통계 생성 중 오류가 발생했습니다.')
            .addFields({
                name: '오류 내용',
                value: error.message || '알 수 없는 오류',
                inline: false
            })
            .setTimestamp();
        
        const backButton = new ButtonBuilder()
            .setCustomId('stats_back')
            .setLabel('뒤로')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary);
        
        await interaction.editReply({
            embeds: [errorEmbed],
            components: [new ActionRowBuilder().addComponents(backButton)],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 상세 통계 표시
 */
export async function showDetailedStats(interaction) {
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
    
    const { stats, label } = session;
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔍 상세 통계')
        .setDescription(`**${label}**`)
        .setTimestamp();
    
    // 시간대별 분석
    const hourlyStats = {};
    for (const topic of session.topics) {
        const hour = new Date(topic.created_at * 1000).getHours();
        hourlyStats[hour] = (hourlyStats[hour] || 0) + 1;
    }
    
    if (Object.keys(hourlyStats).length > 0) {
        const peakHours = Object.entries(hourlyStats)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([hour, count]) => `${hour}시: ${count}개`);
        
        embed.addFields({
            name: '⏰ 활동 시간대 TOP 3',
            value: peakHours.join('\n'),
            inline: true
        });
    }
    
    // 평균 처리 시간 (완료된 안건만)
    const completedTopics = session.topics.filter(t => t.status === '완료');
    if (completedTopics.length > 0) {
        const processingTimes = completedTopics.map(t => 
            (t.updated_at - t.created_at) / (60 * 60 * 24) // 일 단위
        );
        const avgProcessingTime = (processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length).toFixed(1);
        const minProcessingTime = Math.min(...processingTimes).toFixed(1);
        const maxProcessingTime = Math.max(...processingTimes).toFixed(1);
        
        embed.addFields({
            name: '⏱️ 처리 시간 분석',
            value: [
                `평균: **${avgProcessingTime}일**`,
                `최소: **${minProcessingTime}일**`,
                `최대: **${maxProcessingTime}일**`
            ].join('\n'),
            inline: true
        });
    }
    
    // 주간 패턴
    const weekdayStats = {};
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    for (const topic of session.topics) {
        const day = new Date(topic.created_at * 1000).getDay();
        weekdayStats[day] = (weekdayStats[day] || 0) + 1;
    }
    
    if (Object.keys(weekdayStats).length > 0) {
        const weekPattern = Object.entries(weekdayStats)
            .sort(([a], [b]) => a - b)
            .map(([day, count]) => `${weekdays[day]}: ${count}개`);
        
        embed.addFields({
            name: '📅 요일별 분포',
            value: weekPattern.join(' | '),
            inline: false
        });
    }
    
    const backButton = new ButtonBuilder()
        .setCustomId('stats_back_to_result')
        .setLabel('결과로 돌아가기')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary);
    
    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(backButton)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 기간 비교 메뉴
 */
export async function showCompareMenu(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔄 기간 비교')
        .setDescription('비교할 두 기간을 선택하세요.')
        .addFields(
            { name: '예시 1', value: '이번 주 vs 지난 주', inline: true },
            { name: '예시 2', value: '이번 달 vs 지난 달', inline: true },
            { name: '예시 3', value: '올해 vs 작년', inline: true }
        )
        .setTimestamp();
    
    const compareButtons = [
        new ButtonBuilder()
            .setCustomId('stats_compare_week')
            .setLabel('이번 주 vs 지난 주')
            .setEmoji('📊')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('stats_compare_month')
            .setLabel('이번 달 vs 지난 달')
            .setEmoji('📈')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('stats_compare_custom')
            .setLabel('사용자 지정')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('stats_back')
            .setLabel('뒤로')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
    ];
    
    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(compareButtons)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 진행률 바 생성
 */
function createProgressBar(percent) {
    const filled = Math.floor(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * 통계 채널에 게시
 */
export async function postStatsToChannel(interaction) {
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
    
    const guildSettings = getGuildSettings(interaction.guildId);
    const channelId = guildSettings?.tracking_channel_id;
    
    if (!channelId) {
        await interaction.update({
            content: '❌ 트래킹 채널이 설정되지 않았습니다. `/setup`으로 설정해주세요.',
            embeds: [session.embed],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        await interaction.update({
            content: '❌ 트래킹 채널을 찾을 수 없습니다.',
            embeds: [session.embed],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 채널에 게시
    await channel.send({ 
        embeds: [session.embed],
        allowedMentions: { parse: [] }
    });
    
    const successEmbed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ 게시 완료')
        .setDescription(`트래킹 채널 <#${channelId}>에 통계를 게시했습니다.`)
        .setTimestamp();
    
    const backButton = new ButtonBuilder()
        .setCustomId('stats_back')
        .setLabel('메인 메뉴로')
        .setEmoji('🏠')
        .setStyle(ButtonStyle.Primary);
    
    await interaction.update({
        embeds: [successEmbed],
        components: [new ActionRowBuilder().addComponents(backButton)],
        flags: MessageFlags.Ephemeral
    });
}