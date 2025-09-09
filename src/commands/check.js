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
        .setName('check')
        .setDescription('☑️ 체크리스트 관리 - 항목을 완료/해제'),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            // 모든 안건 조회 (진행중 우선)
            const allTopics = getTopics(interaction.guildId, '전체');
            
            // 체크리스트가 있는 안건만 필터링
            const topicsWithChecklist = [];
            
            for (const topic of allTopics) {
                try {
                    const channel = await interaction.guild.channels.fetch(topic.channel_id);
                    if (channel && channel.isTextBased()) {
                        const message = await channel.messages.fetch(topic.message_id).catch(() => null);
                        if (message && message.content.includes('### 체크리스트')) {
                            // 체크리스트 진행률 계산
                            const checklistInfo = parseChecklistInfo(message.content);
                            topicsWithChecklist.push({
                                ...topic,
                                checklistInfo
                            });
                        }
                    }
                } catch (err) {
                    // 메시지를 찾을 수 없으면 스킵
                }
            }
            
            if (topicsWithChecklist.length === 0) {
                await interaction.editReply({
                    content: '📭 체크리스트가 있는 안건이 없습니다.',
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            // 상태별로 정렬 (진행중 -> 대기중 -> 보류 -> 완료)
            const statusOrder = { '진행중': 0, '대기중': 1, '보류': 2, '검토중': 3, '완료': 4, '취소': 5 };
            topicsWithChecklist.sort((a, b) => {
                const orderA = statusOrder[a.status] ?? 99;
                const orderB = statusOrder[b.status] ?? 99;
                return orderA - orderB;
            });
            
            // 최대 25개까지만 표시
            const topicsToShow = topicsWithChecklist.slice(0, 25);
            
            // Embed 생성
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📋 체크리스트 관리')
                .setDescription('체크리스트를 관리할 안건을 선택해주세요.')
                .setFooter({ text: '아래 드롭다운에서 안건을 선택하세요' });
            
            // 안건 목록 미리보기 (최대 5개)
            const preview = topicsToShow.slice(0, 5).map(t => {
                const progress = t.checklistInfo;
                const progressBar = progress.percentage === 100 ? '✅' : '🔄';
                return `${progressBar} **#${t.id}** - ${t.title}\n   └ ${progress.display}`;
            }).join('\n\n');
            
            embed.addFields({
                name: '📊 체크리스트가 있는 안건들',
                value: preview + (topicsWithChecklist.length > 5 ? `\n\n... 외 ${topicsWithChecklist.length - 5}개` : ''),
                inline: false
            });
            
            // Select Menu 생성
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('check_agenda_select')
                .setPlaceholder('🎯 관리할 안건을 선택하세요')
                .addOptions(
                    topicsToShow.map(topic => {
                        const statusEmoji = getStatusEmoji(topic.status);
                        const progress = topic.checklistInfo;
                        const progressEmoji = progress.percentage === 100 ? '✅' : 
                                            progress.percentage >= 50 ? '🔶' : '⬜';
                        
                        return {
                            label: `#${topic.id} - ${topic.title.substring(0, 70)}`,
                            value: String(topic.id),
                            description: `${progressEmoji} ${progress.display} | ${statusEmoji} ${topic.status}`,
                            emoji: progressEmoji
                        };
                    })
                );
            
            const row = new ActionRowBuilder().addComponents(selectMenu);
            
            // 25개 이상인 경우 안내
            if (topicsWithChecklist.length > 25) {
                embed.addFields({
                    name: '⚠️ 안내',
                    value: `전체 ${topicsWithChecklist.length}개 중 최근 25개만 표시됩니다.`,
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

// 체크리스트 정보 파싱
function parseChecklistInfo(content) {
    const lines = content.split('\n');
    let total = 0;
    let checked = 0;
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
            
            if (line.includes('⬜')) {
                total++;
            } else if (line.includes('☑️')) {
                total++;
                checked++;
            }
        }
    }
    
    const percentage = total > 0 ? Math.round((checked / total) * 100) : 0;
    
    return {
        checked,
        total,
        percentage,
        display: `${checked}/${total} (${percentage}%)`
    };
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