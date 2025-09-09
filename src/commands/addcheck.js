import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    MessageFlags 
} from 'discord.js';
import { getTopic } from '../db/database.js';
import { sanitizeMarkdown, addChecklistItem, getChecklistProgress } from '../utils/formatter.js';
import { ensurePermissions } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('addcheck')
        .setDescription('안건에 체크리스트 항목을 추가합니다')
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('안건 ID')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('item')
                .setDescription('추가할 체크리스트 항목')
                .setRequired(true)
        ),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const topicId = interaction.options.getInteger('id');
        const checkItem = interaction.options.getString('item');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // DB에서 안건 조회
            const topic = getTopic(topicId, interaction.guildId);
            
            if (!topic) {
                await interaction.editReply(`❌ 안건 #${topicId}을(를) 찾을 수 없습니다.`);
                return;
            }
            
            // 메시지 가져오기
            const channel = await interaction.guild.channels.fetch(topic.channel_id);
            const message = await channel.messages.fetch(topic.message_id);
            
            // 체크리스트 항목 추가
            const updatedContent = addChecklistItem(message.content, checkItem);
            
            // 진행률 재계산
            const progress = getChecklistProgress(updatedContent);
            let finalContent = updatedContent;
            
            // 기존 진행률 제거 및 새 진행률 추가
            const lines = finalContent.split('\n');
            const progressIndex = lines.findIndex(line => line.startsWith('**진행률**'));
            if (progressIndex !== -1) {
                lines.splice(progressIndex, 1);
                // 빈 줄도 제거
                if (lines[progressIndex] === '') {
                    lines.splice(progressIndex, 1);
                }
            }
            
            const checklistIndex = lines.findIndex(line => line.includes('### 체크리스트'));
            if (checklistIndex !== -1 && progress) {
                lines.splice(checklistIndex, 0, `**진행률**: ${progress.display}`, '');
            }
            
            finalContent = lines.join('\n');
            
            // 버튼 컴포넌트 유지
            const components = message.components;
            await message.edit({ content: finalContent, components });
            
            // 성공 응답
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('➕ 체크리스트 항목 추가')
                .setDescription(`안건 #${topicId} "${sanitizeMarkdown(topic.title)}"에 새 항목이 추가되었습니다.`)
                .addFields(
                    { name: '추가된 항목', value: `⬜ ${checkItem}` },
                    { name: '현재 진행률', value: progress ? progress.display : '0/0 (0%)' }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('체크리스트 항목 추가 중 오류:', error);
            await interaction.editReply('❌ 체크리스트 항목 추가 중 오류가 발생했습니다.');
        }
    },
};