import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getTopic, updateTopicStatus } from '../db/database.js';
import { formatAgendaTitle, replaceCheckboxes, sanitizeMarkdown } from '../utils/formatter.js';
import { ensurePermissions } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('done')
        .setDescription('안건을 완료 처리합니다')
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('완료할 안건 번호')
                .setRequired(true)),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const topicId = interaction.options.getInteger('id');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            const topic = getTopic(topicId);
            
            if (!topic) {
                await interaction.editReply(`❌ 안건 #${topicId}을(를) 찾을 수 없습니다.`);
                return;
            }
            
            if (topic.status === '완료') {
                await interaction.editReply(`ℹ️ 안건 #${topicId}은(는) 이미 완료 상태입니다.`);
                return;
            }
            
            updateTopicStatus(topicId, '완료');
            
            if (topic.thread_id) {
                try {
                    const thread = await interaction.guild.channels.fetch(topic.thread_id);
                    if (thread) {
                        const newTitle = formatAgendaTitle(topicId, topic.title, '완료');
                        await thread.setName(newTitle);
                    }
                } catch (error) {
                    console.error('스레드 제목 업데이트 중 오류:', error);
                }
            }
            
            if (topic.message_id) {
                try {
                    const channel = await interaction.guild.channels.fetch(topic.channel_id);
                    const message = await channel.messages.fetch(topic.message_id);
                    const updatedContent = replaceCheckboxes(message.content);
                    if (updatedContent !== message.content) {
                        await message.edit(updatedContent);
                    }
                } catch (error) {
                    console.error('메시지 체크박스 업데이트 중 오류:', error);
                }
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('✅ 안건 완료')
                .setDescription(`안건 #${topicId} "${sanitizeMarkdown(topic.title)}"이(가) 완료 처리되었습니다.`)
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('안건 완료 처리 중 오류:', error);
            await interaction.editReply('❌ 안건 완료 처리 중 오류가 발생했습니다.');
        }
    },
};
