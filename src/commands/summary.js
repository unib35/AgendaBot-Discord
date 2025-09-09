import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getTopicsBetween, getGuildSettings } from '../db/database.js';
import { summarizeWeeklyGemini } from '../ai/summarize-gemini.js';
import { ensurePermissions } from '../utils/guards.js';

function parseDate(s) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!match) return null;
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
}

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 월요일 시작
    return new Date(d.setDate(diff));
}

export default {
    data: new SlashCommandBuilder()
        .setName('summary')
        .setDescription('AI를 활용한 안건 요약 생성 (Gemini)')
        .addStringOption(option =>
            option.setName('from')
                .setDescription('시작일 (YYYY-MM-DD)')
        )
        .addStringOption(option =>
            option.setName('to')
                .setDescription('종료일 (YYYY-MM-DD)')
        )
        .addBooleanOption(option =>
            option.setName('post')
                .setDescription('트래킹 채널에 게시 (기본: 미리보기만)')
        ),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // 날짜 파싱
            const now = new Date();
            const defaultStart = getWeekStart(now);
            const defaultEnd = new Date(defaultStart);
            defaultEnd.setDate(defaultEnd.getDate() + 7);
            
            const startDate = parseDate(interaction.options.getString('from')) || defaultStart;
            const endDate = parseDate(interaction.options.getString('to')) || defaultEnd;
            
            // 시간을 timestamp로 변환 (초 단위)
            const startTimestamp = Math.floor(startDate.getTime() / 1000);
            const endTimestamp = Math.floor(endDate.getTime() / 1000);
            
            // 안건 조회
            const topics = getTopicsBetween(interaction.guildId, startTimestamp, endTimestamp);
            
            if (topics.length === 0) {
                await interaction.editReply('📭 해당 기간에 안건이 없습니다.');
                return;
            }
            
            // 메시지 내용 가져오기 (필요시)
            const messages = {};
            for (const topic of topics.slice(0, 10)) { // 최대 10개만
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
            
            // AI 요약 생성
            const periodTitle = `주간 안건 요약 (${formatDate(startDate)} ~ ${formatDate(new Date(endDate.getTime() - 1))})`;
            const aiSummary = await summarizeWeeklyGemini(topics, messages);
            
            // Embed 생성
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🤖 AI 안건 요약')
                .setDescription(periodTitle)
                .addFields({
                    name: '📊 통계',
                    value: `총 ${topics.length}개 안건 분석`,
                    inline: false
                });
            
            if (aiSummary) {
                // AI 요약이 너무 길면 분할
                const chunks = aiSummary.match(/.{1,1024}/gs) || [aiSummary];
                chunks.forEach((chunk, index) => {
                    embed.addFields({
                        name: index === 0 ? '📝 Gemini 요약' : '​',
                        value: chunk,
                        inline: false
                    });
                });
            } else {
                embed.addFields({
                    name: '⚠️ AI 요약 실패',
                    value: 'GOOGLE_API_KEY를 확인하거나 나중에 다시 시도해주세요.',
                    inline: false
                });
            }
            
            embed.setFooter({ 
                text: `Powered by ${process.env.GEMINI_MODEL || 'Gemini'}` 
            });
            embed.setTimestamp();
            
            // 게시 옵션 확인
            const shouldPost = interaction.options.getBoolean('post') || false;
            
            if (!shouldPost) {
                // 미리보기만
                await interaction.editReply({ 
                    content: '**미리보기** (post:true로 채널에 게시 가능)',
                    embeds: [embed] 
                });
            } else {
                // 트래킹 채널에 게시
                const guildSettings = getGuildSettings(interaction.guildId);
                const channelId = guildSettings?.tracking_channel_id;
                
                if (!channelId) {
                    await interaction.editReply({
                        content: '❌ 트래킹 채널이 설정되지 않았습니다. `/setup`으로 설정해주세요.',
                        embeds: [embed]
                    });
                    return;
                }
                
                const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
                if (!channel) {
                    await interaction.editReply({
                        content: '❌ 트래킹 채널을 찾을 수 없습니다.',
                        embeds: [embed]
                    });
                    return;
                }
                
                // 채널에 게시
                await channel.send({ 
                    embeds: [embed],
                    allowedMentions: { parse: [] } // 멘션 방지
                });
                
                await interaction.editReply('✅ 트래킹 채널에 요약을 게시했습니다.');
            }
            
        } catch (error) {
            console.error('요약 생성 중 오류:', error);
            await interaction.editReply('❌ 요약 생성 중 오류가 발생했습니다.');
        }
    },
};