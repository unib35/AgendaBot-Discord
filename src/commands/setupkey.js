import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
    PermissionFlagsBits
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setupkey')
        .setDescription('🔑 API 키 설정 - Gemini API 키 등록 (관리자 전용)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction) {
        // 권한 체크
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ 
                content: '❌ 이 명령어는 서버 관리 권한이 필요합니다.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        // 모달 생성
        const modal = new ModalBuilder()
            .setCustomId('set_gemini_key')
            .setTitle('🔐 Gemini API Key 설정');
        
        const keyInput = new TextInputBuilder()
            .setCustomId('gemini_key')
            .setLabel('Google AI Studio API Key')
            .setPlaceholder('AIza...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(30)
            .setMaxLength(100);
        
        const descriptionRow = new ActionRowBuilder().addComponents(keyInput);
        modal.addComponents(descriptionRow);
        
        await interaction.showModal(modal);
    }
};