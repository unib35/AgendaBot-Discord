import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    MessageFlags 
} from 'discord.js';
import { getTopic } from '../db/database.js';
import { sanitizeMarkdown, toggleAllCheckboxes } from '../utils/formatter.js';
import { ensurePermissions } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('checkall')
        .setDescription('안건의 모든 체크리스트 항목을 완료/해제합니다')
        .addIntegerOption(option => 
            option.setName('id')
                .setDescription('안건 ID')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('action')
                .setDescription('수행할 작업')
                .setRequired(true)
                .addChoices(
                    { name: '모두 완료', value: 'check' },
                    { name: '모두 해제', value: 'uncheck' }
                )
        ),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const topicId = interaction.options.getInteger('id');
        const action = interaction.options.getString('action');
        const markAsChecked = action === 'check';
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // DB에서 안건 조회
            const topic = getTopic(topicId, interaction.guildId);
            
            if (!topic) {
                await interaction.editReply(`❌ 안건 #${topicId}를 찾을 수 없습니다.`);
                return;
            }
            
            // 메시지 조회
            const channel = await interaction.guild.channels.fetch(topic.channel_id);
            const message = await channel.messages.fetch(topic.message_id);
            
            // 모든 체크박스 토글
            const result = toggleAllCheckboxes(message.content, markAsChecked);
            
            if (!result.success) {
                await interaction.editReply(result.message);
                return;
            }
            
            // 메시지 업데이트
            await message.edit(result.content);
            
            // 성공 응답
            const actionText = markAsChecked ? '완료' : '해제';
            const actionEmoji = markAsChecked ? '☑️' : '⬜';
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle(`${actionEmoji} 체크리스트 일괄 ${actionText}`)
                .setDescription(`안건 #${topicId} "${sanitizeMarkdown(topic.title)}"의 모든 체크리스트 항목(${result.count}개)을 ${actionText}했습니다.`)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('전체 체크박스 토글 중 오류:', error);
            await interaction.editReply('❌ 체크리스트 업데이트 중 오류가 발생했습니다.');
        }
    },
};