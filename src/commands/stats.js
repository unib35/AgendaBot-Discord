import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getTopicsBetween } from '../db/database.js';
import { ensurePermissions } from '../utils/guards.js';

function parseDate(s) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!match) return null;
    return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00`);
}

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

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
        .setName('stats')
        .setDescription('기간별 안건 통계를 조회합니다')
        .addStringOption(option =>
            option.setName('from')
                .setDescription('시작일 (YYYY-MM-DD)')
        )
        .addStringOption(option =>
            option.setName('to')
                .setDescription('종료일 (YYYY-MM-DD)')
        ),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            const now = new Date();
            const defaultStart = new Date(now);
            defaultStart.setDate(defaultStart.getDate() - 7);
            
            const startDate = parseDate(interaction.options.getString('from')) || defaultStart;
            const endDate = parseDate(interaction.options.getString('to')) || now;
            
            // 시간을 timestamp로 변환 (초 단위)
            const startTimestamp = Math.floor(startDate.getTime() / 1000);
            const endTimestamp = Math.floor(endDate.getTime() / 1000) + 86400; // 종료일 포함
            
            const topics = getTopicsBetween(interaction.guildId, startTimestamp, endTimestamp);
            
            // 상태별 집계
            const statusCount = {};
            let newCount = 0;
            let completedCount = 0;
            
            for (const topic of topics) {
                statusCount[topic.status] = (statusCount[topic.status] || 0) + 1;
                
                // 기간 내 신규 생성된 안건
                if (topic.created_at >= startTimestamp && topic.created_at < endTimestamp) {
                    newCount++;
                }
                
                // 기간 내 완료된 안건
                if (topic.status === '완료' && topic.updated_at >= startTimestamp && topic.updated_at < endTimestamp) {
                    completedCount++;
                }
            }
            
            // Embed 생성
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('📊 안건 통계')
                .setDescription(`**기간**: ${formatDate(startDate)} ~ ${formatDate(endDate)}`)
                .addFields(
                    { 
                        name: '📝 신규 등록', 
                        value: `${newCount}건`, 
                        inline: true 
                    },
                    { 
                        name: '✅ 기간 내 완료', 
                        value: `${completedCount}건`, 
                        inline: true 
                    },
                    { 
                        name: '📋 전체 건수', 
                        value: `${topics.length}건`, 
                        inline: true 
                    }
                );
            
            // 상태별 현황 추가
            if (Object.keys(statusCount).length > 0) {
                const statusFields = Object.entries(statusCount)
                    .sort(([, a], [, b]) => b - a)
                    .map(([status, count]) => {
                        const emoji = STATUS_EMOJIS[status] || '📌';
                        return `${emoji} ${status}: **${count}건**`;
                    });
                
                embed.addFields({
                    name: '📈 상태별 현황',
                    value: statusFields.join('\n') || '데이터 없음',
                    inline: false
                });
            }
            
            // 완료율 계산
            const completionRate = topics.length > 0 
                ? Math.round((statusCount['완료'] || 0) / topics.length * 100)
                : 0;
            
            embed.addFields({
                name: '🎯 완료율',
                value: `${completionRate}% (${statusCount['완료'] || 0}/${topics.length})`,
                inline: false
            });
            
            embed.setFooter({ 
                text: `조회 기준: ${formatDate(now)}` 
            });
            embed.setTimestamp();
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('통계 생성 중 오류:', error);
            await interaction.editReply('❌ 통계 생성 중 오류가 발생했습니다.');
        }
    },
};