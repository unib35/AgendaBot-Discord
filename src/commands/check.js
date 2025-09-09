import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getTopic } from '../db/database.js';
import { toggleCheckbox } from '../utils/formatter.js';
import { ensurePermissions } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('check')
        .setDescription('체크리스트 항목을 토글합니다')
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('안건 번호')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('item')
                .setDescription('체크할 항목 번호 (1부터 시작)')
                .setRequired(true)),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const topicId = interaction.options.getInteger('id');
        const itemNumber = interaction.options.getInteger('item');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            const topic = getTopic(topicId);
            
            if (!topic) {
                await interaction.editReply(`❌ 안건 #${topicId}을(를) 찾을 수 없습니다.`);
                return;
            }
            
            const channel = await interaction.guild.channels.fetch(topic.channel_id);
            const message = await channel.messages.fetch(topic.message_id);
            
            const result = toggleCheckbox(message.content, itemNumber);
            
            if (!result.success) {
                await interaction.editReply(result.message);
                return;
            }
            
            await message.edit(result.content);
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ 체크리스트 업데이트')
                .setDescription(`안건 #${topicId}의 ${itemNumber}번째 항목이 ${result.checked ? '체크' : '체크 해제'}되었습니다.`)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('체크박스 토글 중 오류:', error);
            await interaction.editReply('❌ 체크리스트 업데이트 중 오류가 발생했습니다.');
        }
    },
};
