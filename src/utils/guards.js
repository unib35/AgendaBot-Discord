import { MessageFlags } from 'discord.js';
import { getGuildSettings } from '../db/database.js';

export async function ensureCommandChannel(interaction) {
    // DB에서 길드 설정 가져오기
    const guildSettings = getGuildSettings(interaction.guildId);
    const commandChannelId = guildSettings?.command_channel_id || process.env.COMMAND_CHANNEL_ID;
    
    if (commandChannelId && interaction.channelId !== commandChannelId) {
        await interaction.reply({
            content: `이 명령어는 <#${commandChannelId}> 에서만 사용할 수 있습니다.`,
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }
    
    return true;
}

export async function ensureRole(interaction) {
    // DB에서 길드 설정 가져오기
    const guildSettings = getGuildSettings(interaction.guildId);
    const allowedRoleId = guildSettings?.allowed_role_id || process.env.ALLOWED_ROLE_ID;
    
    if (!allowedRoleId) {
        return true;
    }
    
    const member = interaction.member;
    if (!member.roles.cache.has(allowedRoleId)) {
        await interaction.reply({
            content: `❌ 이 명령어를 사용할 권한이 없습니다.`,
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }
    
    return true;
}

export async function ensurePermissions(interaction) {
    // setup 명령어는 채널 제한 없이 실행 가능 (관리자 전용이므로)
    if (interaction.commandName === 'setup') {
        return true;
    }
    
    const hasChannelPermission = await ensureCommandChannel(interaction);
    if (!hasChannelPermission) return false;
    
    const hasRolePermission = await ensureRole(interaction);
    if (!hasRolePermission) return false;
    
    return true;
}
