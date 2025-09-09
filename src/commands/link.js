import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getTopic } from '../db/database.js';
import { ensurePermissions } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('회의록 링크를 업데이트합니다')
        .addIntegerOption(option =>
            option.setName('id')
                .setDescription('안건 번호')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('url')
                .setDescription('회의록 URL')
                .setRequired(true)),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const topicId = interaction.options.getInteger('id');
        const url = interaction.options.getString('url');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            const topic = getTopic(topicId);
            
            // 간단한 URL 유효성 검사
            const isValidUrl = /^https?:\/\/\S+$/i.test(url);
            if (!isValidUrl) {
                await interaction.editReply('❌ 유효한 URL을 입력해주세요. (http/https)');
                return;
            }
            
            if (!topic) {
                await interaction.editReply(`❌ 안건 #${topicId}을(를) 찾을 수 없습니다.`);
                return;
            }
            
            const channel = await interaction.guild.channels.fetch(topic.channel_id);
            const message = await channel.messages.fetch(topic.message_id);
            
            let content = message.content;
            const lines = content.split('\n');
            const index = lines.findIndex(l => l.trim().startsWith('회의록'));
            if (index >= 0) {
                lines[index] = `회의록: ${url}`;
                content = lines.join('\n');
            } else {
                content = content.trim() ? `${content}\n\n회의록: ${url}` : `회의록: ${url}`;
            }
            
            await message.edit(content);
            
            const embed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle('🔗 회의록 링크 업데이트')
                .setDescription(`안건 #${topicId}의 회의록 링크가 업데이트되었습니다.`)
                .addFields({ name: 'URL', value: url })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('링크 업데이트 중 오류:', error);
            await interaction.editReply('❌ 회의록 링크 업데이트 중 오류가 발생했습니다.');
        }
    },
};
