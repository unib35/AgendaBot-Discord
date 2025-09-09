import { 
    SlashCommandBuilder, 
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags 
} from 'discord.js';
import { getTopics } from '../db/database.js';
import { ensurePermissions } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('addcheck')
        .setDescription('➕ 체크리스트 추가 - 기존 안건에 체크리스트 항목 추가'),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // 진행중/대기중 안건들 조회
            const allTopics = getTopics(interaction.guildId, '전체');
            const activeTopics = allTopics.filter(t => 
                t.status === '진행중' || t.status === '대기중' || t.status === '검토중'
            );
            
            if (activeTopics.length === 0) {
                await interaction.editReply({
                    content: '📭 체크리스트를 추가할 수 있는 활성 안건이 없습니다.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            // 체크리스트 정보 포함하여 정렬
            const topicsWithInfo = [];
            
            for (const topic of activeTopics) {
                try {
                    const channel = await interaction.guild.channels.fetch(topic.channel_id);
                    if (channel && channel.isTextBased()) {
                        const message = await channel.messages.fetch(topic.message_id).catch(() => null);
                        if (message) {
                            const checklistCount = countChecklistItems(message.content);
                            topicsWithInfo.push({
                                ...topic,
                                checklistCount
                            });
                        }
                    }
                } catch (err) {
                    topicsWithInfo.push({
                        ...topic,
                        checklistCount: 0
                    });
                }
            }
            
            // 체크리스트가 적은 순으로 정렬
            topicsWithInfo.sort((a, b) => a.checklistCount - b.checklistCount);
            
            // 최대 25개까지만 표시
            const topicsToShow = topicsWithInfo.slice(0, 25);
            
            // Embed 생성
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('➕ 체크리스트 항목 추가')
                .setDescription('체크리스트를 추가할 안건을 선택해주세요.')
                .setFooter({ text: '아래 드롭다운에서 안건을 선택하세요' });
            
            // 안건 목록 미리보기 (최대 10개)
            const preview = topicsToShow.slice(0, 10).map(t => {
                const statusEmoji = getStatusEmoji(t.status);
                const checkEmoji = t.checklistCount > 0 ? `📋 ${t.checklistCount}개` : '📭 없음';
                return `${statusEmoji} **#${t.id}** - ${t.title}\n   └ 체크리스트: ${checkEmoji}`;
            }).join('\n\n');
            
            embed.addFields({
                name: '📋 활성 안건 목록',
                value: preview + (topicsWithInfo.length > 10 ? `\n\n... 외 ${topicsWithInfo.length - 10}개` : ''),
                inline: false
            });
            
            // Select Menu 생성
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('addcheck_agenda_select')
                .setPlaceholder('🎯 체크리스트를 추가할 안건을 선택하세요')
                .addOptions(
                    topicsToShow.map(topic => {
                        const statusEmoji = getStatusEmoji(topic.status);
                        const checkInfo = topic.checklistCount > 0 
                            ? `체크리스트 ${topic.checklistCount}개` 
                            : '체크리스트 없음';
                        
                        return {
                            label: `#${topic.id} - ${topic.title.substring(0, 70)}`,
                            value: String(topic.id),
                            description: `${checkInfo} | ${topic.status}`,
                            emoji: topic.checklistCount > 0 ? '📋' : '📭'
                        };
                    })
                );
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            // 25개 이상인 경우 안내
            if (topicsWithInfo.length > 25) {
                embed.addFields({
                    name: '⚠️ 안내',
                    value: `전체 ${topicsWithInfo.length}개 중 최근 25개만 표시됩니다.`,
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

// 체크리스트 항목 개수 세기
function countChecklistItems(content) {
    const lines = content.split('\n');
    let count = 0;
    let inChecklist = false;
    
    for (const line of lines) {
        if (line.includes('### 체크리스트')) {
            inChecklist = true;
            continue;
        }
        
        if (inChecklist) {
            if (line.startsWith('#') && !line.startsWith('###')) {
                break;
            }
            
            if (line.includes('⬜') || line.includes('☑️')) {
                count++;
            }
        }
    }
    
    return count;
}

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