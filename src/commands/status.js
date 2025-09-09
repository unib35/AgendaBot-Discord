import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags 
} from 'discord.js';
import { getTopics } from '../db/database.js';
import { ensurePermissions } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('안건 상태를 변경합니다'),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // 모든 안건 조회 (완료/취소 제외)
            const allTopics = getTopics(interaction.guildId, '전체');
            const activeTopics = allTopics.filter(t => 
                t.status !== '완료' && t.status !== '취소'
            );
            
            if (activeTopics.length === 0) {
                await interaction.editReply({
                    content: '📭 상태를 변경할 수 있는 안건이 없습니다.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            // 상태별로 정렬
            const statusOrder = { '진행중': 0, '검토중': 1, '대기중': 2, '보류': 3 };
            activeTopics.sort((a, b) => {
                const orderA = statusOrder[a.status] ?? 99;
                const orderB = statusOrder[b.status] ?? 99;
                return orderA - orderB;
            });
            
            // 최대 25개까지만 표시
            const topicsToShow = activeTopics.slice(0, 25);
            
            // Embed 생성
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🔄 안건 상태 변경')
                .setDescription('상태를 변경할 안건을 선택해주세요.')
                .setFooter({ text: '아래 드롭다운에서 안건을 선택하세요' });
            
            // 안건 목록 미리보기 (최대 10개)
            const preview = topicsToShow.slice(0, 10).map(t => {
                const statusEmoji = getStatusEmoji(t.status);
                return `${statusEmoji} **#${t.id}** - ${t.title}\n   └ 현재: ${t.status}`;
            }).join('\n\n');
            
            embed.addFields({
                name: '📋 활성 안건 목록',
                value: preview + (activeTopics.length > 10 ? `\n\n... 외 ${activeTopics.length - 10}개` : ''),
                inline: false
            });
            
            // Select Menu 생성
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('status_agenda_select')
                .setPlaceholder('🎯 상태를 변경할 안건을 선택하세요')
                .addOptions(
                    topicsToShow.map(topic => {
                        const statusEmoji = getStatusEmoji(topic.status);
                        const createdDate = new Date(topic.created_at * 1000).toLocaleDateString('ko-KR');
                        
                        return {
                            label: `#${topic.id} - ${topic.title.substring(0, 70)}`,
                            value: String(topic.id),
                            description: `현재: ${topic.status} | 생성: ${createdDate}`,
                            emoji: statusEmoji
                        };
                    })
                );
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            // 25개 이상인 경우 안내
            if (activeTopics.length > 25) {
                embed.addFields({
                    name: '⚠️ 안내',
                    value: `전체 ${activeTopics.length}개 중 최근 25개만 표시됩니다.`,
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

// 상태별 이모지
function getStatusEmoji(status) {
    const emojis = {
        '진행중': '🧭',
        '완료': '✅',
        '보류': '⏸️',
        '취소': '❌',
        '검토중': '🔄',
        '대기중': '⏳'
    };
    return emojis[status] || '📋';
}