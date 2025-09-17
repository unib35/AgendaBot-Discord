import { MessageFlags } from 'discord.js';
import { getGuildSettings, getTopic } from '../db/database.js';

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

/**
 * 안건 수정 권한 확인 (관리자, 작성자, 담당자)
 * @param {Interaction} interaction - Discord interaction
 * @param {number} topicId - 안건 ID
 * @returns {boolean} 권한 여부
 */
export async function canModifyTopic(interaction, topicId) {
    const topic = getTopic(topicId);
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return false;
    }

    const member = interaction.member;
    const userId = interaction.user.id;

    // 관리자 권한 확인
    if (member.permissions.has('MANAGE_GUILD')) {
        return true;
    }

    // 작성자 확인
    if (topic.created_by === userId) {
        return true;
    }

    // 담당자 확인 (메시지에서 멘션된 유저 확인)
    try {
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        const message = await channel.messages.fetch(topic.message_id);
        if (message && message.mentions.users.has(userId)) {
            return true;
        }
    } catch (error) {
        console.error('담당자 확인 중 오류:', error);
    }

    await interaction.reply({
        content: '❌ 이 안건을 수정할 권한이 없습니다.\n(관리자, 작성자, 담당자만 가능)',
        flags: MessageFlags.Ephemeral
    });
    return false;
}

/**
 * 리마인더 수정 권한 확인
 * @param {Interaction} interaction - Discord interaction
 * @param {number} topicId - 안건 ID
 * @returns {boolean} 권한 여부
 */
export async function canModifyReminder(interaction, topicId) {
    // 안건 수정 권한과 동일하게 적용
    return canModifyTopic(interaction, topicId);
}
