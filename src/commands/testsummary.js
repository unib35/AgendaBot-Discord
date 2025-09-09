import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    MessageFlags, 
    ChannelType 
} from 'discord.js';
import { getGuildSettings, getTopicsBetween } from '../db/database.js';
import { decrypt } from '../utils/secret.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

function getWeekStart(date, startDay = 'MON') {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = startDay === 'SUN' ? -day : (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return d;
}

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default {
    data: new SlashCommandBuilder()
        .setName('testsummary')
        .setDescription('서버별 AI 설정을 테스트합니다')
        .addBooleanOption(option =>
            option.setName('post')
                .setDescription('요약 채널에 실제로 게시할지 여부')
                .setRequired(false)),
    
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // 서버 설정 가져오기
            const settings = getGuildSettings(interaction.guildId);
            
            if (!settings) {
                return interaction.editReply({
                    content: '❌ 서버 설정이 없습니다. `/setup` 명령어로 먼저 설정해주세요.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            if (!settings.ai_api_key_encrypted) {
                return interaction.editReply({
                    content: '❌ API 키가 설정되지 않았습니다. `/setupkey` 명령어로 설정해주세요.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // API 키 복호화
            const apiKey = decrypt(settings.ai_api_key_encrypted);
            if (!apiKey) {
                return interaction.editReply({
                    content: '❌ API 키 복호화에 실패했습니다.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // 지난 주 범위 계산
            const weekStart = settings.week_start || 'MON';
            const now = new Date();
            const weekEnd = getWeekStart(now, weekStart);
            const weekStartDate = new Date(weekEnd);
            weekStartDate.setDate(weekStartDate.getDate() - 7);
            
            // 안건 조회
            const startTimestamp = Math.floor(weekStartDate.getTime() / 1000);
            const endTimestamp = Math.floor(weekEnd.getTime() / 1000);
            const topics = getTopicsBetween(interaction.guildId, startTimestamp, endTimestamp);
            
            if (!topics || topics.length === 0) {
                return interaction.editReply({
                    content: `⚠️ ${formatDate(weekStartDate)} ~ ${formatDate(new Date(weekEnd.getTime() - 1))} 기간 동안 안건이 없습니다.`,
                    flags: MessageFlags.Ephemeral
                });
            }
            
            // Gemini AI 초기화
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ 
                model: settings.gemini_model || 'gemini-2.0-flash-exp' 
            });
            
            // 프롬프트 생성
            const topicsText = topics.map(topic => 
                `- [${topic.status}] ${topic.title} (ID: ${topic.id})`
            ).join('\n');
            
            const prompt = `다음은 지난 주의 안건 목록입니다. 핵심 내용을 요약해주세요.

기간: ${formatDate(weekStartDate)} ~ ${formatDate(new Date(weekEnd.getTime() - 1))}
총 안건 수: ${topics.length}개

안건 목록:
${topicsText}

요약 형식:
1. 주요 활동: 가장 중요한 안건 3-5개 요약
2. 진행 상황: 완료된 안건과 진행 중인 안건 정리
3. 다음 단계: 향후 집중해야 할 사항

간결하고 실용적인 요약을 제공해주세요.`;
            
            // AI 요약 생성
            const result = await model.generateContent(prompt);
            const aiSummary = result.response?.text() || '요약 생성 실패';
            
            // Embed 생성
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🧪 AI 요약 테스트')
                .setDescription(`기간: ${formatDate(weekStartDate)} ~ ${formatDate(new Date(weekEnd.getTime() - 1))}`)
                .addFields(
                    {
                        name: '📊 통계',
                        value: `총 ${topics.length}개 안건`,
                        inline: true
                    },
                    {
                        name: '🤖 모델',
                        value: settings.gemini_model || 'gemini-2.0-flash-exp',
                        inline: true
                    },
                    {
                        name: '📢 요약 채널',
                        value: settings.summary_channel_id ? `<#${settings.summary_channel_id}>` : '미설정',
                        inline: true
                    }
                );
            
            // AI 요약 추가
            const chunks = aiSummary.match(/.{1,1024}/gs) || [aiSummary];
            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: index === 0 ? '📝 AI 요약' : '​',
                    value: chunk,
                    inline: false
                });
            });
            
            embed.setFooter({ text: '테스트 요약' });
            embed.setTimestamp();
            
            // 실제 게시 여부 확인
            const shouldPost = interaction.options.getBoolean('post');
            
            if (shouldPost) {
                const summaryChannelId = settings.summary_channel_id || settings.tracking_channel_id;
                if (!summaryChannelId) {
                    return interaction.editReply({
                        content: '❌ 요약 채널이 설정되지 않았습니다.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const channel = await interaction.guild.channels.fetch(summaryChannelId).catch(() => null);
                if (!channel || channel.type !== ChannelType.GuildText) {
                    return interaction.editReply({
                        content: '❌ 요약 채널을 찾을 수 없습니다.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                await channel.send({ embeds: [embed] });
                
                await interaction.editReply({
                    content: `✅ 테스트 요약이 <#${summaryChannelId}>에 게시되었습니다.`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.editReply({
                    embeds: [embed],
                    content: '💡 `post: true` 옵션을 사용하면 실제 채널에 게시됩니다.',
                    flags: MessageFlags.Ephemeral
                });
            }
            
        } catch (error) {
            console.error('Test summary error:', error);
            
            let errorMessage = '❌ 요약 테스트 중 오류가 발생했습니다.';
            
            if (error.message?.includes('API_KEY_INVALID')) {
                errorMessage = '❌ 잘못된 API 키입니다. `/setupkey`로 다시 설정해주세요.';
            } else if (error.message?.includes('RATE_LIMIT')) {
                errorMessage = '❌ API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.';
            }
            
            await interaction.editReply({
                content: errorMessage,
                flags: MessageFlags.Ephemeral
            });
        }
    },
};