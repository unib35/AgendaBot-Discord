import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    MessageFlags 
} from 'discord.js';
import { searchTopics } from '../db/database.js';
import { sanitizeMarkdown, formatTimestamp } from '../utils/formatter.js';
import { ensurePermissions } from '../utils/guards.js';

const STATUS_EMOJIS = {
    '진행중': '🧭',
    '완료': '✅',
    '보류': '⏸️',
    '취소': '❌',
    '검토중': '🔄',
    '대기중': '⏳'
};

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('안건을 검색합니다')
        .addStringOption(option =>
            option.setName('keyword')
                .setDescription('검색할 키워드')
                .setRequired(true)
        ),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const keyword = interaction.options.getString('keyword');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // 키워드로 검색
            const topics = searchTopics(interaction.guildId, keyword);
            
            if (topics.length === 0) {
                await interaction.editReply(`🔍 "${keyword}"에 대한 검색 결과가 없습니다.`);
                return;
            }
            
            // 검색 결과를 embed로 표시
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`🔍 검색 결과: "${keyword}"`)
                .setDescription(`총 ${topics.length}개의 안건을 찾았습니다.`)
                .setTimestamp();
            
            // 최대 10개까지만 표시
            const displayTopics = topics.slice(0, 10);
            
            for (const topic of displayTopics) {
                const statusEmoji = STATUS_EMOJIS[topic.status] || '🧭';
                const createdAt = formatTimestamp(topic.created_at * 1000);
                
                let fieldValue = `${statusEmoji} ${topic.status}`;
                if (topic.thread_id) {
                    fieldValue += ` | <#${topic.thread_id}>`;
                }
                fieldValue += `\n생성일: ${createdAt}`;
                
                embed.addFields({
                    name: `#${topic.id} ${sanitizeMarkdown(topic.title)}`,
                    value: fieldValue,
                    inline: false
                });
            }
            
            if (topics.length > 10) {
                embed.setFooter({ text: `... 외 ${topics.length - 10}개의 안건이 더 있습니다.` });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('검색 중 오류:', error);
            await interaction.editReply('❌ 검색 중 오류가 발생했습니다.');
        }
    },
};