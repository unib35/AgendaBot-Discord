import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    MessageFlags 
} from 'discord.js';
import { getGuildSettings } from '../db/database.js';
import { decrypt } from '../utils/secret.js';

export default {
    data: new SlashCommandBuilder()
        .setName('checksetup')
        .setDescription('현재 서버의 봇 설정을 확인합니다'),
    
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // 길드 설정 가져오기
            const settings = getGuildSettings(interaction.guildId);
            
            if (!settings) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('⚠️ 설정 없음')
                    .setDescription('이 서버에 대한 설정이 없습니다.\n`/setup` 명령어로 초기 설정을 진행해주세요.')
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
                return;
            }
            
            // 각 설정 상태 확인
            const checkEmoji = (value) => value ? '✅' : '❌';
            const maskValue = (value, showLength = 4) => {
                if (!value) return '미설정';
                if (value.length <= showLength) return '*'.repeat(value.length);
                return value.substring(0, showLength) + '*'.repeat(value.length - showLength);
            };
            
            // 채널 확인
            let trackingChannelName = '미설정';
            let commandChannelName = '미설정';
            let summaryChannelName = '미설정';
            
            if (settings.tracking_channel_id) {
                try {
                    const channel = await interaction.guild.channels.fetch(settings.tracking_channel_id);
                    trackingChannelName = channel ? `<#${channel.id}>` : '❌ 채널을 찾을 수 없음';
                } catch {
                    trackingChannelName = '❌ 채널을 찾을 수 없음';
                }
            }
            
            if (settings.command_channel_id) {
                try {
                    const channel = await interaction.guild.channels.fetch(settings.command_channel_id);
                    commandChannelName = channel ? `<#${channel.id}>` : '❌ 채널을 찾을 수 없음';
                } catch {
                    commandChannelName = '❌ 채널을 찾을 수 없음';
                }
            }
            
            if (settings.summary_channel_id) {
                try {
                    const channel = await interaction.guild.channels.fetch(settings.summary_channel_id);
                    summaryChannelName = channel ? `<#${channel.id}>` : '❌ 채널을 찾을 수 없음';
                } catch {
                    summaryChannelName = '❌ 채널을 찾을 수 없음';
                }
            }
            
            // 역할 확인
            let roleName = '미설정';
            if (settings.allowed_role_id) {
                try {
                    const role = await interaction.guild.roles.fetch(settings.allowed_role_id);
                    roleName = role ? `<@&${role.id}>` : '❌ 역할을 찾을 수 없음';
                } catch {
                    roleName = '❌ 역할을 찾을 수 없음';
                }
            }
            
            // API 키 확인
            let apiKeyStatus = '❌ 미설정';
            let apiKeyValid = false;
            if (settings.ai_api_key_encrypted) {
                try {
                    const decrypted = decrypt(settings.ai_api_key_encrypted);
                    if (decrypted && decrypted.startsWith('AIza')) {
                        apiKeyStatus = '✅ 설정됨 (암호화 저장)';
                        apiKeyValid = true;
                    } else {
                        apiKeyStatus = '⚠️ 키 형식 오류';
                    }
                } catch {
                    apiKeyStatus = '⚠️ 복호화 오류';
                }
            }
            
            // 요약 설정 확인
            const weeklySummaryStatus = settings.weekly_summary_enabled ? '✅ 활성화' : '❌ 비활성화';
            const summarySchedule = settings.weekly_summary_cron || '0 9 * * MON (매주 월요일 오전 9시)';
            const weekStart = settings.week_start || 'MON';
            const geminiModel = settings.gemini_model || 'gemini-2.0-flash-exp';
            
            // Embed 생성
            const embed = new EmbedBuilder()
                .setColor(apiKeyValid && settings.tracking_channel_id ? 0x00FF00 : 0xFFA500)
                .setTitle('🔧 서버 설정 현황')
                .setDescription(`**서버**: ${interaction.guild.name}\n**설정 상태**: ${apiKeyValid && settings.tracking_channel_id ? '✅ 정상' : '⚠️ 일부 설정 필요'}`)
                .addFields(
                    { 
                        name: '📢 채널 설정', 
                        value: `**안건 게시 채널**: ${trackingChannelName}\n**명령어 채널**: ${commandChannelName}\n**요약 출력 채널**: ${summaryChannelName || trackingChannelName}`,
                        inline: false 
                    },
                    { 
                        name: '👥 권한 설정', 
                        value: `**허용 역할**: ${roleName}`,
                        inline: false 
                    },
                    { 
                        name: '🤖 AI 설정', 
                        value: `**Gemini API 키**: ${apiKeyStatus}\n**모델**: ${geminiModel}`,
                        inline: false 
                    },
                    { 
                        name: '📊 주간 요약 설정', 
                        value: `**상태**: ${weeklySummaryStatus}\n**스케줄**: ${summarySchedule}\n**주 시작**: ${weekStart === 'SUN' ? '일요일' : '월요일'}`,
                        inline: false 
                    }
                );
            
            // 필수 설정 체크
            const missingSettings = [];
            if (!settings.tracking_channel_id) missingSettings.push('안건 게시 채널');
            if (!apiKeyValid && settings.weekly_summary_enabled) missingSettings.push('Gemini API 키 (요약 기능용)');
            
            if (missingSettings.length > 0) {
                embed.addFields({
                    name: '⚠️ 필요한 설정',
                    value: missingSettings.map(s => `• ${s}`).join('\n'),
                    inline: false
                });
            }
            
            // 마지막 업데이트 시간
            if (settings.updated_at) {
                const updatedDate = new Date(settings.updated_at);
                const koreanTime = new Intl.DateTimeFormat('ko-KR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Seoul'
                }).format(updatedDate);
                
                embed.setFooter({ text: `마지막 업데이트: ${koreanTime}` });
            }
            
            embed.setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('설정 확인 중 오류:', error);
            await interaction.editReply({
                content: '❌ 설정을 확인하는 중 오류가 발생했습니다.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};