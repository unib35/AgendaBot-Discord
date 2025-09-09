import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    MessageFlags,
    ChannelType,
    PermissionFlagsBits
} from 'discord.js';
import { upsertGuildSettings, getGuildSettings } from '../db/database.js';
import { buildCronExpression, parseCronExpression, isValidTime } from '../utils/schedule.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('⚙️ 봇 설정 - 서버별 설정 구성 (관리자 전용)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option.setName('tracking_channel')
                .setDescription('안건이 등록될 출력 채널')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('command_channel')
                .setDescription('명령어를 입력할 채널 (비우면 모든 채널 허용)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('allowed_role')
                .setDescription('명령어 사용 권한 역할 (비우면 모두 허용)')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('summary_channel')
                .setDescription('AI 요약을 게시할 채널')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('weekly_enabled')
                .setDescription('주간 자동 요약 사용 여부')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('summary_day')
                .setDescription('자동 요약 실행 요일')
                .addChoices(
                    { name: '월요일', value: 'MON' },
                    { name: '화요일', value: 'TUE' },
                    { name: '수요일', value: 'WED' },
                    { name: '목요일', value: 'THU' },
                    { name: '금요일', value: 'FRI' },
                    { name: '토요일', value: 'SAT' },
                    { name: '일요일', value: 'SUN' }
                )
                .setRequired(false))
        .addStringOption(option =>
            option.setName('summary_time')
                .setDescription('자동 요약 실행 시간 (예: 09:00, 14:30)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('week_start')
                .setDescription('주 시작 기준일')
                .addChoices(
                    { name: '월요일', value: 'MON' },
                    { name: '일요일', value: 'SUN' }
                )
                .setRequired(false))
        .addStringOption(option =>
            option.setName('model')
                .setDescription('Gemini 모델 (예: gemini-2.0-flash-exp)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('show_current')
                .setDescription('현재 설정만 확인')
                .setRequired(false)),
    
    async execute(interaction) {
        // 권한 체크
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ 
                content: '❌ 이 명령어는 서버 관리 권한이 필요합니다.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        const showCurrent = interaction.options.getBoolean('show_current');
        
        // 현재 설정 조회
        const currentSettings = getGuildSettings(interaction.guildId) || {};
        
        if (showCurrent) {
            // 현재 설정만 표시
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('⚙️ 현재 봇 설정')
                .setDescription('이 서버의 AgendaBot 설정입니다.')
                .addFields(
                    {
                        name: '📤 출력 채널',
                        value: currentSettings.tracking_channel_id 
                            ? `<#${currentSettings.tracking_channel_id}>` 
                            : '❌ 설정되지 않음',
                        inline: true
                    },
                    {
                        name: '💬 명령 채널',
                        value: currentSettings.command_channel_id 
                            ? `<#${currentSettings.command_channel_id}>` 
                            : '✅ 모든 채널',
                        inline: true
                    },
                    {
                        name: '🔐 권한 역할',
                        value: currentSettings.allowed_role_id 
                            ? `<@&${currentSettings.allowed_role_id}>` 
                            : '✅ 모든 사용자',
                        inline: true
                    },
                    {
                        name: '📢 요약 채널',
                        value: currentSettings.summary_channel_id 
                            ? `<#${currentSettings.summary_channel_id}>` 
                            : '📤 출력 채널 사용',
                        inline: true
                    },
                    {
                        name: '⏱ 자동 요약',
                        value: currentSettings.weekly_summary_enabled 
                            ? '✅ 활성화' 
                            : '⏸ 비활성화',
                        inline: true
                    },
                    {
                        name: '🕔 스케줄',
                        value: parseCronExpression(currentSettings.weekly_summary_cron || '0 9 * * MON'),
                        inline: true
                    },
                    {
                        name: '📆 주 시작',
                        value: currentSettings.week_start === 'SUN' ? '일요일' : '월요일',
                        inline: true
                    },
                    {
                        name: '🤖 AI 모델',
                        value: currentSettings.gemini_model || 'gemini-2.0-flash-exp',
                        inline: true
                    },
                    {
                        name: '🔑 API 키',
                        value: currentSettings.ai_api_key_encrypted 
                            ? '✅ 설정됨' 
                            : '⚠️ 미설정 (/setupkey)',
                        inline: true
                    }
                )
                .setFooter({ text: 'API 키는 /setupkey 명령어로 설정하세요' })
                .setTimestamp();
            
            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // 새 설정 가져오기
        const trackingChannel = interaction.options.getChannel('tracking_channel');
        const commandChannel = interaction.options.getChannel('command_channel');
        const allowedRole = interaction.options.getRole('allowed_role');
        const summaryChannel = interaction.options.getChannel('summary_channel');
        const weeklyEnabled = interaction.options.getBoolean('weekly_enabled');
        const summaryDay = interaction.options.getString('summary_day');
        const summaryTime = interaction.options.getString('summary_time');
        const weekStart = interaction.options.getString('week_start');
        const model = interaction.options.getString('model');
        
        // 아무 옵션도 없으면 현재 설정 표시
        if (!trackingChannel && !commandChannel && !allowedRole && !summaryChannel && 
            weeklyEnabled === null && !summaryDay && !summaryTime && !weekStart && !model) {
            // 현재 설정 표시와 동일
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('⚙️ 현재 봇 설정')
                .setDescription('변경할 설정을 옵션으로 지정해주세요.')
                .addFields(
                    {
                        name: '📤 출력 채널',
                        value: currentSettings.tracking_channel_id 
                            ? `<#${currentSettings.tracking_channel_id}>` 
                            : '❌ 설정되지 않음',
                        inline: true
                    },
                    {
                        name: '💬 명령 채널',
                        value: currentSettings.command_channel_id 
                            ? `<#${currentSettings.command_channel_id}>` 
                            : '✅ 모든 채널',
                        inline: true
                    },
                    {
                        name: '🔐 권한 역할',
                        value: currentSettings.allowed_role_id 
                            ? `<@&${currentSettings.allowed_role_id}>` 
                            : '✅ 모든 사용자',
                        inline: true
                    }
                )
                .setFooter({ text: '설정을 변경하려면 /setup 명령어에 옵션을 추가하세요' })
                .setTimestamp();
            
            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // 시간 유효성 검증
        if (summaryTime && !isValidTime(summaryTime)) {
            await interaction.reply({
                content: '❌ 잘못된 시간 형식입니다. 예: 09:00, 14:30',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // cron 표현식 생성 (사용자 친화적 입력에서)
        let cron = null;
        if (summaryDay || summaryTime) {
            // 현재 설정에서 기본값 가져오기
            const currentCron = currentSettings.weekly_summary_cron || '0 9 * * MON';
            const parts = currentCron.split(' ');
            const currentDay = parts[4] || 'MON';
            const currentTime = `${parts[1] || '9'}:${(parts[0] || '0').padStart(2, '0')}`;
            
            cron = buildCronExpression(
                summaryDay || currentDay,
                summaryTime || currentTime
            );
        }
        
        // 설정 업데이트
        const newSettings = {
            tracking_channel_id: trackingChannel?.id,
            command_channel_id: commandChannel?.id,
            allowed_role_id: allowedRole?.id,
            summary_channel_id: summaryChannel?.id,
            weekly_summary_enabled: weeklyEnabled,
            weekly_summary_cron: cron,
            week_start: weekStart,
            gemini_model: model,
            ai_provider: 'gemini'
        };
        
        // undefined 값 제거 (기존 값 유지)
        Object.keys(newSettings).forEach(key => {
            if (newSettings[key] === undefined) {
                delete newSettings[key];
            }
        });
        
        upsertGuildSettings(interaction.guildId, newSettings);
        
        // 업데이트된 설정 가져오기
        const updatedSettings = getGuildSettings(interaction.guildId);
        
        // 성공 메시지
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('✅ 설정이 업데이트되었습니다')
            .setDescription('변경된 설정이 적용되었습니다.')
            .addFields(
                {
                    name: '📤 출력 채널',
                    value: updatedSettings.tracking_channel_id 
                        ? `<#${updatedSettings.tracking_channel_id}>` 
                        : '❌ 설정되지 않음',
                    inline: true
                },
                {
                    name: '💬 명령 채널',
                    value: updatedSettings.command_channel_id 
                        ? `<#${updatedSettings.command_channel_id}>` 
                        : '✅ 모든 채널',
                    inline: true
                },
                {
                    name: '🔐 권한 역할',
                    value: updatedSettings.allowed_role_id 
                        ? `<@&${updatedSettings.allowed_role_id}>` 
                        : '✅ 모든 사용자',
                    inline: true
                },
                {
                    name: '📢 요약 채널',
                    value: updatedSettings.summary_channel_id 
                        ? `<#${updatedSettings.summary_channel_id}>` 
                        : '📤 출력 채널 사용',
                    inline: true
                },
                {
                    name: '⏱ 자동 요약',
                    value: updatedSettings.weekly_summary_enabled 
                        ? '✅ 활성화' 
                        : '⏸ 비활성화',
                    inline: true
                },
                {
                    name: '🕔 스케줄',
                    value: parseCronExpression(updatedSettings.weekly_summary_cron || '0 9 * * MON'),
                    inline: true
                },
                {
                    name: '🤖 AI 모델',
                    value: updatedSettings.gemini_model || 'gemini-2.0-flash-exp',
                    inline: true
                }
            )
            .setFooter({ text: 'API 키는 /setupkey로 설정하세요' })
            .setTimestamp();
        
        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    },
};