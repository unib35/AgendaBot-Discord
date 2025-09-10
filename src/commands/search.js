import { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags 
} from 'discord.js';
import { advancedSearchTopics } from '../db/database.js';
import { sanitizeMarkdown } from '../utils/formatter.js';
import { ensurePermissions } from '../utils/guards.js';

// 검색 세션 저장
export const searchSessions = new Map();

const STATUS_EMOJIS = {
    '진행중': '🚀',
    '완료': '✅',
    '보류': '⏸️',
    '취소': '❌',
    '검토중': '🔄',
    '대기중': '⏳'
};

export default {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('🔍 고급 검색 - 인터랙티브 필터와 페이지네이션'),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // 초기 검색 메뉴 표시
        await showSearchMenu(interaction);
    },
};

/**
 * 검색 메뉴 표시
 */
export async function showSearchMenu(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔍 고급 검색')
        .setDescription('검색 조건을 선택하세요. 여러 조건을 조합할 수 있습니다.')
        .addFields(
            {
                name: '🔤 키워드 검색',
                value: '제목이나 내용에서 특정 단어를 검색합니다.',
                inline: false
            },
            {
                name: '📊 상태 필터',
                value: '특정 상태의 안건만 표시합니다.',
                inline: false
            },
            {
                name: '👤 담당자 필터',
                value: '특정 사용자가 생성한 안건을 찾습니다.',
                inline: false
            },
            {
                name: '📅 기간 필터',
                value: '특정 기간의 안건을 검색합니다.',
                inline: false
            }
        )
        .setFooter({ text: '검색 조건을 선택하거나 바로 검색을 시작하세요' });
    
    // 검색 옵션 버튼들
    const searchButtons = [
        new ButtonBuilder()
            .setCustomId('search_keyword')
            .setLabel('키워드 입력')
            .setEmoji('🔤')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('search_status')
            .setLabel('상태 선택')
            .setEmoji('📊')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('search_assignee')
            .setLabel('담당자 선택')
            .setEmoji('👤')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('search_date')
            .setLabel('기간 설정')
            .setEmoji('📅')
            .setStyle(ButtonStyle.Primary)
    ];
    
    const actionButtons = [
        new ButtonBuilder()
            .setCustomId('search_execute')
            .setLabel('검색 실행')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('search_reset')
            .setLabel('초기화')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('search_cancel')
            .setLabel('취소')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    ];
    
    const components = [
        new ActionRowBuilder().addComponents(searchButtons),
        new ActionRowBuilder().addComponents(actionButtons)
    ];
    
    // 세션 초기화
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    searchSessions.set(sessionKey, {
        keyword: '',
        status: null,
        assignee: null,
        fromDate: null,
        toDate: null,
        sort: 'created_at',
        order: 'DESC',
        page: 1
    });
    
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
            embeds: [embed],
            components: components
        });
    } else {
        await interaction.reply({
            embeds: [embed],
            components: components,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 검색 실행
 */
export async function executeSearch(interaction, page = 1) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey) || {};
    
    // 페이지 업데이트
    session.page = page;
    
    // 검색 실행
    const searchResults = advancedSearchTopics(interaction.guildId, {
        ...session,
        pageSize: 10
    });
    
    // 결과 Embed 생성
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔍 검색 결과 (${searchResults.total}건)`)
        .setFooter({ 
            text: `페이지 ${searchResults.page}/${searchResults.totalPages || 1}` 
        })
        .setTimestamp();
    
    // 검색 조건 표시
    const filters = [];
    if (session.keyword) filters.push(`키워드: "${session.keyword}"`);
    if (session.status) filters.push(`상태: ${session.status}`);
    if (session.assignee) filters.push(`담당자: <@${session.assignee}>`);
    if (session.fromDate || session.toDate) {
        const dateRange = [];
        if (session.fromDate) dateRange.push(`${session.fromDate}부터`);
        if (session.toDate) dateRange.push(`${session.toDate}까지`);
        filters.push(`기간: ${dateRange.join(' ')}`);
    }
    
    if (filters.length > 0) {
        embed.setDescription(`**검색 조건**: ${filters.join(' | ')}`);
    }
    
    // 검색 결과 표시
    if (searchResults.items.length === 0) {
        embed.addFields({
            name: '📭 검색 결과 없음',
            value: '조건에 맞는 안건이 없습니다.',
            inline: false
        });
    } else {
        for (const topic of searchResults.items) {
            const statusEmoji = STATUS_EMOJIS[topic.status] || '📋';
            const createdAt = new Date(topic.created_at * 1000).toLocaleDateString('ko-KR');
            
            let fieldValue = `${statusEmoji} **${topic.status}** | 생성: ${createdAt}`;
            if (topic.thread_id) {
                fieldValue += ` | <#${topic.thread_id}>`;
            }
            fieldValue += `\n👤 <@${topic.created_by}>`;
            
            // 키워드 하이라이트 (간단히)
            let title = sanitizeMarkdown(topic.title);
            if (session.keyword) {
                const regex = new RegExp(`(${session.keyword})`, 'gi');
                title = title.replace(regex, '**$1**');
            }
            
            embed.addFields({
                name: `#${topic.id} ${title}`,
                value: fieldValue,
                inline: false
            });
        }
    }
    
    // 페이지네이션 버튼
    const paginationButtons = [
        new ButtonBuilder()
            .setCustomId(`search_first`)
            .setLabel('처음')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(`search_prev`)
            .setLabel('이전')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),
        new ButtonBuilder()
            .setCustomId(`search_page`)
            .setLabel(`${page}/${searchResults.totalPages || 1}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`search_next`)
            .setLabel('다음')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= searchResults.totalPages),
        new ButtonBuilder()
            .setCustomId(`search_last`)
            .setLabel('마지막')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= searchResults.totalPages)
    ];
    
    const actionButtons = [
        new ButtonBuilder()
            .setCustomId('search_modify')
            .setLabel('검색 조건 수정')
            .setEmoji('🔧')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('search_sort')
            .setLabel('정렬 변경')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('search_export')
            .setLabel('내보내기')
            .setEmoji('💾')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true), // 추후 구현
        new ButtonBuilder()
            .setCustomId('search_close')
            .setLabel('닫기')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    ];
    
    const components = [
        new ActionRowBuilder().addComponents(paginationButtons),
        new ActionRowBuilder().addComponents(actionButtons)
    ];
    
    await interaction.update({
        embeds: [embed],
        components: components
    });
}

/**
 * 상태 선택 메뉴
 */
export async function showStatusFilter(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey);
    
    const statusOptions = [
        { label: '전체', value: 'all', emoji: '📋' },
        { label: '진행중', value: '진행중', emoji: '🚀' },
        { label: '완료', value: '완료', emoji: '✅' },
        { label: '보류', value: '보류', emoji: '⏸️' },
        { label: '취소', value: '취소', emoji: '❌' },
        { label: '검토중', value: '검토중', emoji: '🔄' },
        { label: '대기중', value: '대기중', emoji: '⏳' }
    ];
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('search_status_select')
        .setPlaceholder('상태를 선택하세요')
        .addOptions(statusOptions.map(opt => ({
            label: opt.label,
            value: opt.value,
            emoji: opt.emoji,
            default: session?.status === opt.value || (!session?.status && opt.value === 'all')
        })));
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📊 상태 필터')
        .setDescription('검색할 안건의 상태를 선택하세요.')
        .addFields({
            name: '현재 선택',
            value: session?.status || '전체',
            inline: false
        });
    
    const components = [
        new ActionRowBuilder().addComponents(selectMenu),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('search_back_to_menu')
                .setLabel('뒤로')
                .setEmoji('↩️')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
    
    await interaction.update({
        embeds: [embed],
        components: components
    });
}

/**
 * 정렬 옵션 메뉴
 */
export async function showSortOptions(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey);
    
    const sortOptions = [
        { label: '생성일 (최신순)', value: 'created_desc', emoji: '🆕' },
        { label: '생성일 (오래된순)', value: 'created_asc', emoji: '📅' },
        { label: '수정일 (최신순)', value: 'updated_desc', emoji: '✏️' },
        { label: '수정일 (오래된순)', value: 'updated_asc', emoji: '📝' },
        { label: '제목 (가나다순)', value: 'title_asc', emoji: '🔤' },
        { label: '제목 (역순)', value: 'title_desc', emoji: '🔤' },
        { label: '상태순', value: 'status_asc', emoji: '📊' }
    ];
    
    const currentSort = `${session?.sort}_${session?.order.toLowerCase()}`;
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('search_sort_select')
        .setPlaceholder('정렬 방식을 선택하세요')
        .addOptions(sortOptions.map(opt => ({
            label: opt.label,
            value: opt.value,
            emoji: opt.emoji,
            default: currentSort === opt.value || (!session && opt.value === 'created_desc')
        })));
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔀 정렬 옵션')
        .setDescription('검색 결과의 정렬 방식을 선택하세요.');
    
    const components = [
        new ActionRowBuilder().addComponents(selectMenu),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('search_back_to_results')
                .setLabel('뒤로')
                .setEmoji('↩️')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
    
    await interaction.update({
        embeds: [embed],
        components: components
    });
}