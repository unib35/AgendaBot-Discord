import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags 
} from 'discord.js';
import { getTopics } from '../db/database.js';
import { ensurePermissions } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('done')
        .setDescription('✅ 안건 완료 - 진행중인 안건을 완료 상태로 변경'),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // 진행중인 안건들 조회
            const topics = getTopics(interaction.guildId, '진행중');
            
            if (!topics || topics.length === 0) {
                await interaction.editReply({
                    content: '📭 진행중인 안건이 없습니다.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            // 최대 25개까지만 표시 (Discord 제한)
            const topicsToShow = topics.slice(0, 25);
            
            // Embed 생성
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('✅ 안건 완료 처리')
                .setDescription('완료할 안건을 선택해주세요.')
                .addFields({
                    name: '📋 진행중인 안건',
                    value: topicsToShow.slice(0, 10).map(t => 
                        `**#${t.id}** - ${t.title}`
                    ).join('\n') + (topics.length > 10 ? `\n... 외 ${topics.length - 10}개` : ''),
                    inline: false
                })
                .setFooter({ text: '아래 드롭다운에서 안건을 선택하세요' });
            
            // Select Menu 생성
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('done_select')
                .setPlaceholder('🎯 완료할 안건을 선택하세요')
                .addOptions(
                    topicsToShow.map(topic => ({
                        label: `#${topic.id} - ${topic.title.substring(0, 80)}`,
                        value: String(topic.id),
                        description: `생성: ${new Date(topic.created_at * 1000).toLocaleDateString('ko-KR')}`,
                        emoji: '📋'
                    }))
                );
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            // 25개 이상인 경우 안내
            if (topics.length > 25) {
                embed.addFields({
                    name: '⚠️ 안내',
                    value: `전체 ${topics.length}개 중 최근 25개만 표시됩니다.\n특정 안건을 찾으시려면 \`/done id:\` 명령어를 사용하세요.`,
                    inline: false
                });
            }
            
            await interaction.editReply({
                embeds: [embed],
                components: [row],
                flags: MessageFlags.Ephemeral
            });
            
        } catch (error) {
            console.error('안건 조회 중 오류:', error);
            await interaction.editReply({
                content: '❌ 안건을 조회하는 중 오류가 발생했습니다.',
                flags: MessageFlags.Ephemeral
            });
        }
    },
};