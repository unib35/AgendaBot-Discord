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
    getGuildSettings,
    getTopics 
} from '../db/database.js';
import { summarizeWeeklyGemini } from '../ai/summarize-gemini.js';
import { decrypt } from '../utils/secret.js';
import { ensurePermissions } from '../utils/guards.js';

// 세션 저장소
export const summarySessions = new Map();

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

export default {
    data: new SlashCommandBuilder()
        .setName('summary')
        .setDescription('📊 AI 요약 - 기간별 안건 분석 및 요약'),

    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // 메인 메뉴 표시
        await showSummaryMenu(interaction);
    }
};

/**
 * 요약 메인 메뉴 표시
 */
export async function showSummaryMenu(interaction) {
    const now = new Date();
    const today = formatDate(now);
    
    // 이번 주 날짜 계산
    const weekStart = getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    // 지난 주 날짜 계산
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    
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
    
    await interaction.editReply({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 요약 생성 및 표시
 */
export async function generateSummary(interaction, startDate, endDate, label) {
    // 로딩 메시지
    const loadingEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⏳ 요약 생성 중...')
        .setDescription(`**${label}**\n\nAI가 안건을 분석하고 있습니다...`)
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
        
        if (topics.length === 0) {
            const noDataEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('📭 데이터 없음')
                .setDescription(`**${label}**\n\n해당 기간에 안건이 없습니다.`)
                .setTimestamp();
            
            const backButton = new ButtonBuilder()
                .setCustomId('summary_back')
                .setLabel('뒤로')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Secondary);
            
            await interaction.editReply({
                embeds: [noDataEmbed],
                components: [new ActionRowBuilder().addComponents(backButton)],
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // 상태별 통계 계산
        const statusCounts = {
            '진행중': 0,
            '대기중': 0,
            '검토중': 0,
            '완료': 0,
            '취소': 0
        };
        
        topics.forEach(topic => {
            if (statusCounts[topic.status] !== undefined) {
                statusCounts[topic.status]++;
            }
        });
        
        // 메시지 내용 가져오기
        const messages = {};
        for (const topic of topics.slice(0, 20)) { // 최대 20개
            try {
                const channel = await interaction.guild.channels.fetch(topic.channel_id);
                if (channel) {
                    const message = await channel.messages.fetch(topic.message_id);
                    if (message) {
                        messages[topic.message_id] = message.content;
                    }
                }
            } catch (err) {
                // 메시지를 찾을 수 없어도 계속 진행
            }
        }
        
        // 길드 설정에서 API 키 가져오기
        const guildSettings = getGuildSettings(interaction.guildId);
        let apiKey = null;
        let modelName = 'gemini-2.0-flash-exp';
        
        if (guildSettings?.ai_api_key_encrypted) {
            apiKey = decrypt(guildSettings.ai_api_key_encrypted);
            modelName = guildSettings.gemini_model || modelName;
        }
        
        // AI 요약 생성
        const aiSummary = await summarizeWeeklyGemini(topics, messages, { apiKey, modelName });
        
        // 진행률 바 생성
        const total = topics.length;
        const completed = statusCounts['완료'];
        const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
        const progressBar = createProgressBar(progressPercent);
        
        // 결과 Embed 생성
        const resultEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('📊 AI 요약 결과')
            .setDescription(`**${label}**`)
            .addFields(
                {
                    name: '📈 통계',
                    value: [
                        `**총 안건**: ${total}개`,
                        `**완료율**: ${progressPercent}% ${progressBar}`,
                        '',
                        '**상태별 분포**',
                        `🔄 진행중: ${statusCounts['진행중']}개`,
                        `⏸️ 대기중: ${statusCounts['대기중']}개`,
                        `🔍 검토중: ${statusCounts['검토중']}개`,
                        `✅ 완료: ${statusCounts['완료']}개`,
                        `❌ 취소: ${statusCounts['취소']}개`
                    ].join('\n'),
                    inline: false
                }
            );
        
        if (aiSummary) {
            // AI 요약이 너무 길면 분할
            const chunks = aiSummary.match(/.{1,1000}/gs) || [aiSummary];
            chunks.forEach((chunk, index) => {
                resultEmbed.addFields({
                    name: index === 0 ? '🤖 AI 분석' : '​',
                    value: chunk,
                    inline: false
                });
            });
        } else {
            resultEmbed.addFields({
                name: '⚠️ AI 요약 실패',
                value: 'API 키를 확인하거나 나중에 다시 시도해주세요.',
                inline: false
            });
        }
        
        resultEmbed
            .setFooter({ text: `Powered by ${modelName}` })
            .setTimestamp();
        
        // 세션에 결과 저장
        const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
        summarySessions.set(sessionKey, {
            embed: resultEmbed,
            topics: topics,
            label: label
        });
        
        // 액션 버튼들
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
                .setDisabled(true), // 추후 구현
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
        
        await interaction.editReply({
            embeds: [resultEmbed],
            components: [new ActionRowBuilder().addComponents(actionButtons)],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('요약 생성 중 오류:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ 오류 발생')
            .setDescription('요약 생성 중 오류가 발생했습니다.')
            .addFields({
                name: '오류 내용',
                value: error.message || '알 수 없는 오류',
                inline: false
            })
            .setTimestamp();
        
        const backButton = new ButtonBuilder()
            .setCustomId('summary_back')
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
 * 진행률 바 생성
 */
function createProgressBar(percent) {
    const filled = Math.floor(percent / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * 요약 채널에 게시
 */
export async function postSummaryToChannel(interaction) {
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
        .setDescription(`트래킹 채널 <#${channelId}>에 요약을 게시했습니다.`)
        .setTimestamp();
    
    const backButton = new ButtonBuilder()
        .setCustomId('summary_back')
        .setLabel('메인 메뉴로')
        .setEmoji('🏠')
        .setStyle(ButtonStyle.Primary);
    
    await interaction.update({
        embeds: [successEmbed],
        components: [new ActionRowBuilder().addComponents(backButton)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 상태 필터 메뉴 표시
 */
export async function showFilterMenu(interaction) {
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
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔍 상태별 필터링')
        .setDescription('표시할 안건의 상태를 선택하세요.')
        .setTimestamp();
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('summary_filter_select')
        .setPlaceholder('상태 선택...')
        .addOptions([
            {
                label: '전체',
                description: '모든 안건 표시',
                value: 'all',
                emoji: '📋'
            },
            {
                label: '진행중',
                description: '진행중인 안건만',
                value: '진행중',
                emoji: '🔄'
            },
            {
                label: '대기중',
                description: '대기중인 안건만',
                value: '대기중',
                emoji: '⏸️'
            },
            {
                label: '검토중',
                description: '검토중인 안건만',
                value: '검토중',
                emoji: '🔍'
            },
            {
                label: '완료',
                description: '완료된 안건만',
                value: '완료',
                emoji: '✅'
            },
            {
                label: '취소',
                description: '취소된 안건만',
                value: '취소',
                emoji: '❌'
            }
        ]);
    
    const cancelButton = new ButtonBuilder()
        .setCustomId('summary_filter_cancel')
        .setLabel('취소')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary);
    
    await interaction.update({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(selectMenu),
            new ActionRowBuilder().addComponents(cancelButton)
        ],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 필터 적용
 */
export async function applyFilter(interaction, status) {
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
    
    const filteredTopics = status === 'all' 
        ? session.topics 
        : session.topics.filter(t => t.status === status);
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📋 필터링 결과: ${status === 'all' ? '전체' : status}`)
        .setDescription(`**${session.label}**\n\n${status === 'all' ? '전체' : status} 안건 ${filteredTopics.length}개`)
        .setTimestamp();
    
    // 안건 목록 표시 (최대 10개)
    if (filteredTopics.length > 0) {
        const topicList = filteredTopics.slice(0, 10).map(topic => 
            `• **#${topic.id}** - ${topic.title.substring(0, 40)} (${topic.status})`
        ).join('\n');
        
        embed.addFields({
            name: '안건 목록',
            value: topicList + (filteredTopics.length > 10 ? `\n... 외 ${filteredTopics.length - 10}개` : ''),
            inline: false
        });
    }
    
    const backButton = new ButtonBuilder()
        .setCustomId('summary_back_to_result')
        .setLabel('결과로 돌아가기')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary);
    
    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(backButton)],
        flags: MessageFlags.Ephemeral
    });
}