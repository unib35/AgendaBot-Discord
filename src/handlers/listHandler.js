import {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} from 'discord.js';
import { listSessions, showListPage } from '../commands/list.js';
import { getTopics, getTopicsByFilter } from '../db/database.js';

/**
 * 리스트 버튼 처리
 */
export async function handleListButton(interaction) {
    if (!interaction.customId.startsWith('list:')) return;
    
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const sessionId = parts[2];
    
    const session = listSessions.get(sessionId);
    if (!session) {
        await interaction.reply({
            content: '⏱️ 세션이 만료되었습니다. `/list` 명령어를 다시 실행해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const { currentPage, totalPages } = session;
    
    switch (action) {
        case 'first':
            await showListPage(interaction, sessionId, 0);
            break;
            
        case 'prev':
            await showListPage(interaction, sessionId, Math.max(0, currentPage - 1));
            break;
            
        case 'next':
            await showListPage(interaction, sessionId, Math.min(totalPages - 1, currentPage + 1));
            break;
            
        case 'last':
            await showListPage(interaction, sessionId, totalPages - 1);
            break;
            
        case 'refresh':
            await handleRefresh(interaction, sessionId);
            break;
            
        case 'filter':
            await handleFilterMenu(interaction, sessionId);
            break;
            
        case 'export':
            await handleExport(interaction, sessionId);
            break;
    }
}

/**
 * 페이지 점프 메뉴 처리
 */
export async function handleListJump(interaction) {
    if (!interaction.customId.startsWith('list:jump:')) return;
    
    const sessionId = interaction.customId.replace('list:jump:', '');
    const pageIndex = parseInt(interaction.values[0]);
    
    await showListPage(interaction, sessionId, pageIndex);
}

/**
 * 새로고침 처리
 */
async function handleRefresh(interaction, sessionId) {
    const session = listSessions.get(sessionId);
    if (!session) return;
    
    const { statusFilter, ownerFilter, sortOption } = session;
    
    // 데이터 다시 가져오기
    let topics;
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
    
    // 세션 업데이트
    session.topics = topics;
    session.totalPages = Math.ceil(topics.length / 10);
    session.currentPage = Math.min(session.currentPage, session.totalPages - 1);
    
    await showListPage(interaction, sessionId, session.currentPage);
}

/**
 * 필터 메뉴 표시
 */
async function handleFilterMenu(interaction, sessionId) {
    const session = listSessions.get(sessionId);
    if (!session) return;
    
    const { statusFilter, sortOption } = session;
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔍 필터 및 정렬 설정')
        .setDescription('목록의 필터와 정렬 방식을 변경할 수 있습니다.')
        .addFields(
            { name: '현재 상태 필터', value: statusFilter, inline: true },
            { name: '현재 정렬', value: getSortLabel(sortOption), inline: true }
        );
    
    // 상태 필터 선택 메뉴
    const statusMenu = new StringSelectMenuBuilder()
        .setCustomId(`list:filter:status:${sessionId}`)
        .setPlaceholder('상태 필터 선택')
        .addOptions([
            { label: '전체', value: '전체', emoji: '📋', default: statusFilter === '전체' },
            { label: '진행중', value: '진행중', emoji: '🧭', default: statusFilter === '진행중' },
            { label: '완료', value: '완료', emoji: '✅', default: statusFilter === '완료' },
            { label: '보류', value: '보류', emoji: '⏸️', default: statusFilter === '보류' },
            { label: '취소', value: '취소', emoji: '❌', default: statusFilter === '취소' },
            { label: '검토중', value: '검토중', emoji: '🔄', default: statusFilter === '검토중' },
            { label: '대기중', value: '대기중', emoji: '⏳', default: statusFilter === '대기중' }
        ]);
    
    // 정렬 선택 메뉴
    const sortMenu = new StringSelectMenuBuilder()
        .setCustomId(`list:filter:sort:${sessionId}`)
        .setPlaceholder('정렬 방식 선택')
        .addOptions([
            { label: '최신순', value: 'newest', emoji: '📅', default: sortOption === 'newest' },
            { label: '오래된순', value: 'oldest', emoji: '📅', default: sortOption === 'oldest' },
            { label: '번호순', value: 'id', emoji: '🔢', default: sortOption === 'id' },
            { label: '상태순', value: 'status', emoji: '📊', default: sortOption === 'status' }
        ]);
    
    await interaction.update({
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(statusMenu),
            new ActionRowBuilder().addComponents(sortMenu)
        ]
    });
}

/**
 * 필터 선택 처리
 */
export async function handleListFilter(interaction) {
    if (!interaction.customId.startsWith('list:filter:')) return;
    
    const parts = interaction.customId.split(':');
    const filterType = parts[2];
    const sessionId = parts[3];
    
    const session = listSessions.get(sessionId);
    if (!session) {
        await interaction.reply({
            content: '⏱️ 세션이 만료되었습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    if (filterType === 'status') {
        session.statusFilter = interaction.values[0];
    } else if (filterType === 'sort') {
        session.sortOption = interaction.values[0];
    }
    
    // 데이터 다시 가져오기 및 필터/정렬 적용
    await handleRefresh(interaction, sessionId);
}

/**
 * 내보내기 처리
 */
async function handleExport(interaction, sessionId) {
    const session = listSessions.get(sessionId);
    if (!session) return;
    
    const { topics, statusFilter, ownerFilter, sortOption } = session;
    
    if (topics.length === 0) {
        await interaction.reply({
            content: '📭 내보낼 안건이 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    await interaction.deferUpdate();
    
    // CSV 형식으로 데이터 생성
    let csv = '번호,제목,상태,담당자,생성일,스레드ID\n';
    
    for (const topic of topics) {
        const createdDate = new Date(topic.created_at * 1000).toLocaleDateString('ko-KR');
        const title = topic.title.replace(/"/g, '""'); // CSV 이스케이프
        csv += `${topic.id},"${title}",${topic.status},${topic.created_by},${createdDate},${topic.thread_id || '없음'}\n`;
    }
    
    // 통계 정보 생성
    const statusCounts = {};
    for (const topic of topics) {
        statusCounts[topic.status] = (statusCounts[topic.status] || 0) + 1;
    }
    
    // 결과 Embed
    const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('📊 안건 목록 내보내기')
        .setDescription('안건 목록이 준비되었습니다.')
        .addFields(
            { name: '전체 안건 수', value: `${topics.length}개`, inline: true },
            { name: '필터', value: statusFilter !== '전체' ? statusFilter : '전체', inline: true },
            { name: '정렬', value: getSortLabel(sortOption), inline: true }
        );
    
    // 상태별 통계 추가
    if (Object.keys(statusCounts).length > 0) {
        const statsText = Object.entries(statusCounts)
            .map(([status, count]) => {
                const emoji = getStatusEmoji(status);
                return `${emoji} ${status}: ${count}개`;
            })
            .join('\n');
        
        embed.addFields({
            name: '📈 상태별 통계',
            value: statsText,
            inline: false
        });
    }
    
    // CSV 데이터를 코드 블록으로 표시 (일부만)
    const csvPreview = csv.split('\n').slice(0, 6).join('\n');
    embed.addFields({
        name: '📄 CSV 미리보기',
        value: `\`\`\`csv\n${csvPreview}\n...\`\`\``,
        inline: false
    });
    
    // 전체 CSV를 별도 메시지로 전송
    await interaction.followUp({
        content: '📎 전체 CSV 데이터:',
        files: [{
            attachment: Buffer.from(csv, 'utf-8'),
            name: `agenda_export_${Date.now()}.csv`
        }],
        embeds: [embed],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 정렬 라벨 가져오기
 */
function getSortLabel(sortOption) {
    const labels = {
        'newest': '📅 최신순',
        'oldest': '📅 오래된순',
        'id': '🔢 번호순',
        'status': '📊 상태순'
    };
    return labels[sortOption] || sortOption;
}

/**
 * 상태 이모지 가져오기
 */
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

/**
 * 안건 정렬 (list.js에서 복사)
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