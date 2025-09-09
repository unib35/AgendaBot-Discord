import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getTopics, getTopicsByFilter } from '../db/database.js';
import { sanitizeMarkdown } from '../utils/formatter.js';
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
        .setName('list')
        .setDescription('안건 목록을 조회합니다')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('필터링할 상태')
                .addChoices(
                    { name: '전체', value: '전체' },
                    { name: '🧭 진행중', value: '진행중' },
                    { name: '✅ 완료', value: '완료' },
                    { name: '⏸️ 보류', value: '보류' },
                    { name: '❌ 취소', value: '취소' },
                    { name: '🔄 검토중', value: '검토중' },
                    { name: '⏳ 대기중', value: '대기중' }
                ))
        .addUserOption(option =>
            option.setName('owner')
                .setDescription('담당자로 필터링')
        ),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const statusFilter = interaction.options.getString('status') || '전체';
        const ownerFilter = interaction.options.getUser('owner');
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        try {
            let topics;
            
            // 필터 조건에 따라 다른 함수 호출
            if (ownerFilter || (statusFilter !== '전체')) {
                const filter = {};
                if (statusFilter !== '전체') {
                    filter.status = statusFilter;
                }
                if (ownerFilter) {
                    filter.createdBy = ownerFilter.id;
                }
                topics = getTopicsByFilter(interaction.guildId, filter);
            } else {
                topics = getTopics(interaction.guildId, '전체');
            }
            
            // 필터 설명 문자열 생성
            let filterDesc = [];
            if (statusFilter !== '전체') {
                filterDesc.push(`상태: ${STATUS_EMOJIS[statusFilter]} ${statusFilter}`);
            }
            if (ownerFilter) {
                filterDesc.push(`담당자: ${ownerFilter.username}`);
            }
            const filterText = filterDesc.length > 0 ? ` (${filterDesc.join(', ')})` : '';
            
            if (topics.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xffff00)
                    .setTitle('📋 안건 목록')
                    .setDescription(`조건에 맞는 안건이 없습니다${filterText}`)
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
                return;
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(`📋 안건 목록${filterText}`)
                .setDescription(`총 ${topics.length}개의 안건`)
                .setTimestamp();
            
            const topicList = topics.slice(0, 25).map(topic => {
                const statusEmoji = STATUS_EMOJIS[topic.status] || '🧭';
                const threadLink = topic.thread_id ? `<#${topic.thread_id}>` : '스레드 없음';
                const createdAtSec = typeof topic.created_at === 'number'
                    ? topic.created_at
                    : Math.floor(new Date(topic.created_at).getTime() / 1000);
                
                // 담당자 정보 가져오기 (created_by를 담당자로 표시)
                const owner = `<@${topic.created_by}>`;
                
                return {
                    name: `${statusEmoji} #${topic.id} - ${sanitizeMarkdown(topic.title)}`,
                    value: `상태: ${topic.status} | 담당: ${owner}\n스레드: ${threadLink} | 생성: <t:${createdAtSec}:R>`,
                    inline: false
                };
            });
            
            embed.addFields(topicList);
            
            if (topics.length > 25) {
                embed.setFooter({ text: `외 ${topics.length - 25}개 더...` });
            }
            
            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('안건 목록 조회 중 오류:', error);
            await interaction.editReply('❌ 안건 목록 조회 중 오류가 발생했습니다.');
        }
    },
};
