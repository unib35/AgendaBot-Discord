import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags 
} from 'discord.js';
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

const ITEMS_PER_PAGE = 10;

// 리스트 세션 저장소
const listSessions = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('list')
        .setDescription('📋 안건 목록 - 등록된 안건 조회 및 필터링')
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
        )
        .addStringOption(option =>
            option.setName('sort')
                .setDescription('정렬 방식')
                .addChoices(
                    { name: '📅 최신순', value: 'newest' },
                    { name: '📅 오래된순', value: 'oldest' },
                    { name: '🔢 번호순', value: 'id' },
                    { name: '📊 상태순', value: 'status' }
                )),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const statusFilter = interaction.options.getString('status') || '전체';
        const ownerFilter = interaction.options.getUser('owner');
        const sortOption = interaction.options.getString('sort') || 'newest';
        
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
            
            // 정렬 적용
            topics = sortTopics(topics, sortOption);
            
            // 세션 생성
            const sessionId = `${interaction.user.id}_${Date.now()}`;
            const session = {
                topics,
                currentPage: 0,
                statusFilter,
                ownerFilter,
                sortOption,
                totalPages: Math.ceil(topics.length / ITEMS_PER_PAGE)
            };
            listSessions.set(sessionId, session);
            
            // 5분 후 세션 자동 삭제
            setTimeout(() => {
                listSessions.delete(sessionId);
            }, 5 * 60 * 1000);
            
            // 초기 페이지 표시
            await showListPage(interaction, sessionId, 0);
            
        } catch (error) {
            console.error('안건 목록 조회 중 오류:', error);
            await interaction.editReply('❌ 안건 목록 조회 중 오류가 발생했습니다.');
        }
    },
};

/**
 * 리스트 페이지 표시
 */
async function showListPage(interaction, sessionId, pageIndex) {
    const session = listSessions.get(sessionId);
    if (!session) {
        const response = {
            content: '⏱️ 세션이 만료되었습니다. `/list` 명령어를 다시 실행해주세요.',
            embeds: [],
            components: []
        };
        
        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            await interaction.update(response);
        } else {
            await interaction.editReply(response);
        }
        return;
    }
    
    const { topics, statusFilter, ownerFilter, sortOption, totalPages } = session;
    session.currentPage = pageIndex;
    
    // 필터 설명 문자열 생성
    let filterDesc = [];
    if (statusFilter !== '전체') {
        filterDesc.push(`${STATUS_EMOJIS[statusFilter]} ${statusFilter}`);
    }
    if (ownerFilter) {
        filterDesc.push(`👤 ${ownerFilter.username}`);
    }
    
    const sortLabels = {
        'newest': '📅 최신순',
        'oldest': '📅 오래된순',
        'id': '🔢 번호순',
        'status': '📊 상태순'
    };
    filterDesc.push(sortLabels[sortOption]);
    
    // Embed 생성
    const embed = new EmbedBuilder()
        .setColor(topics.length === 0 ? 0xffff00 : 0x5865F2)
        .setTitle('📋 안건 목록')
        .setFooter({ 
            text: totalPages > 0 ? 
                `페이지 ${pageIndex + 1}/${totalPages} | 전체 ${topics.length}개` : 
                '검색 결과 없음' 
        })
        .setTimestamp();
    
    if (filterDesc.length > 0) {
        embed.setDescription(`**필터**: ${filterDesc.join(' | ')}`);
    }
    
    if (topics.length === 0) {
        embed.addFields({
            name: '검색 결과',
            value: '조건에 맞는 안건이 없습니다.',
            inline: false
        });
        
        const response = { 
            embeds: [embed],
            components: []
        };
        
        if (interaction.isButton() || interaction.isStringSelectMenu()) {
            await interaction.update(response);
        } else {
            await interaction.editReply(response);
        }
        return;
    }
    
    // 현재 페이지의 안건들
    const start = pageIndex * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, topics.length);
    const pageTopics = topics.slice(start, end);
    
    // 안건 목록 표시
    for (const topic of pageTopics) {
        const statusEmoji = STATUS_EMOJIS[topic.status] || '📋';
        const threadLink = topic.thread_id ? `<#${topic.thread_id}>` : '스레드 없음';
        const createdAtSec = typeof topic.created_at === 'number'
            ? topic.created_at
            : Math.floor(new Date(topic.created_at).getTime() / 1000);
        
        const owner = `<@${topic.created_by}>`;
        
        // 체크리스트 정보 추가
        let checklistInfo = '';
        try {
            const guild = interaction.guild;
            const channel = await guild.channels.fetch(topic.channel_id).catch(() => null);
            if (channel && channel.isTextBased()) {
                const message = await channel.messages.fetch(topic.message_id).catch(() => null);
                if (message && message.content.includes('### 체크리스트')) {
                    const checklistCount = countChecklistItems(message.content);
                    const completedCount = countCompletedItems(message.content);
                    if (checklistCount > 0) {
                        const percentage = Math.round((completedCount / checklistCount) * 100);
                        checklistInfo = `\n📋 체크리스트: ${completedCount}/${checklistCount} (${percentage}%)`;
                    }
                }
            }
        } catch (e) {
            // 무시
        }
        
        embed.addFields({
            name: `${statusEmoji} #${topic.id} - ${sanitizeMarkdown(topic.title)}`,
            value: `담당: ${owner} | 생성: <t:${createdAtSec}:R>\n스레드: ${threadLink}${checklistInfo}`,
            inline: false
        });
    }
    
    // 컴포넌트 생성
    const components = [];
    
    // 페이지네이션 버튼
    if (totalPages > 1) {
        const pageButtons = new ActionRowBuilder();
        
        pageButtons.addComponents(
            new ButtonBuilder()
                .setCustomId(`list:first:${sessionId}`)
                .setLabel('처음')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏮️')
                .setDisabled(pageIndex === 0),
            
            new ButtonBuilder()
                .setCustomId(`list:prev:${sessionId}`)
                .setLabel('이전')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('◀️')
                .setDisabled(pageIndex === 0),
            
            new ButtonBuilder()
                .setCustomId(`list:page:${sessionId}`)
                .setLabel(`${pageIndex + 1} / ${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            
            new ButtonBuilder()
                .setCustomId(`list:next:${sessionId}`)
                .setLabel('다음')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('▶️')
                .setDisabled(pageIndex === totalPages - 1),
            
            new ButtonBuilder()
                .setCustomId(`list:last:${sessionId}`)
                .setLabel('마지막')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏭️')
                .setDisabled(pageIndex === totalPages - 1)
        );
        
        components.push(pageButtons);
    }
    
    // 페이지 점프 메뉴 (페이지가 많을 때만)
    if (totalPages > 5) {
        const jumpOptions = [];
        const maxOptions = Math.min(25, totalPages);
        const step = Math.max(1, Math.floor(totalPages / maxOptions));
        
        for (let i = 0; i < totalPages; i += step) {
            const pageNum = i + 1;
            jumpOptions.push({
                label: `페이지 ${pageNum}`,
                value: String(i),
                description: `${i * ITEMS_PER_PAGE + 1}번 ~ ${Math.min((i + 1) * ITEMS_PER_PAGE, topics.length)}번 안건`,
                emoji: i === pageIndex ? '📍' : '📄',
                default: i === pageIndex
            });
        }
        
        const jumpMenu = new StringSelectMenuBuilder()
            .setCustomId(`list:jump:${sessionId}`)
            .setPlaceholder('🔍 페이지로 이동')
            .addOptions(jumpOptions);
        
        components.push(new ActionRowBuilder().addComponents(jumpMenu));
    }
    
    // 액션 버튼들
    const actionButtons = new ActionRowBuilder();
    
    actionButtons.addComponents(
        new ButtonBuilder()
            .setCustomId(`list:filter:${sessionId}`)
            .setLabel('필터 변경')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔍'),
        
        new ButtonBuilder()
            .setCustomId(`list:refresh:${sessionId}`)
            .setLabel('새로고침')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄'),
        
        new ButtonBuilder()
            .setCustomId(`list:export:${sessionId}`)
            .setLabel('내보내기')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📊')
    );
    
    components.push(actionButtons);
    
    // Check if this is a button interaction or initial command
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        await interaction.update({
            embeds: [embed],
            components
        });
    } else {
        await interaction.editReply({
            embeds: [embed],
            components
        });
    }
}

/**
 * 안건 정렬
 */
function sortTopics(topics, sortOption) {
    const sortedTopics = [...topics];
    
    switch (sortOption) {
        case 'newest':
            sortedTopics.sort((a, b) => b.created_at - a.created_at);
            break;
        case 'oldest':
            sortedTopics.sort((a, b) => a.created_at - b.created_at);
            break;
        case 'id':
            sortedTopics.sort((a, b) => b.id - a.id);
            break;
        case 'status':
            const statusOrder = {
                '진행중': 0,
                '검토중': 1,
                '대기중': 2,
                '보류': 3,
                '완료': 4,
                '취소': 5
            };
            sortedTopics.sort((a, b) => {
                const orderA = statusOrder[a.status] ?? 99;
                const orderB = statusOrder[b.status] ?? 99;
                if (orderA !== orderB) return orderA - orderB;
                return b.id - a.id;
            });
            break;
    }
    
    return sortedTopics;
}

/**
 * 체크리스트 항목 개수 세기
 */
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

/**
 * 완료된 체크리스트 항목 개수 세기
 */
function countCompletedItems(content) {
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
            
            if (line.includes('☑️')) {
                count++;
            }
        }
    }
    
    return count;
}

// Export for handler
export { listSessions, showListPage };