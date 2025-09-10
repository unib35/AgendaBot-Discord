import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
    MessageFlags
} from 'discord.js';
import {
    searchSessions,
    showSearchMenu,
    executeSearch,
    showStatusFilter,
    showSortOptions
} from '../commands/search.js';

/**
 * 키워드 입력 모달
 */
export async function handleSearchKeyword(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('search_keyword_modal')
        .setTitle('🔤 키워드 검색');
    
    const keywordInput = new TextInputBuilder()
        .setCustomId('keyword')
        .setLabel('검색할 키워드')
        .setPlaceholder('제목이나 내용에서 검색할 단어를 입력하세요')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
    
    modal.addComponents(new ActionRowBuilder().addComponents(keywordInput));
    await interaction.showModal(modal);
}

/**
 * 키워드 모달 제출 처리
 */
export async function handleSearchKeywordModal(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey) || {};
    
    const keyword = interaction.fields.getTextInputValue('keyword');
    session.keyword = keyword;
    searchSessions.set(sessionKey, session);
    
    await interaction.reply({
        content: keyword ? `✅ 키워드 설정: "${keyword}"` : '✅ 키워드 필터 제거',
        flags: MessageFlags.Ephemeral
    });
    
    // 메뉴로 돌아가기
    setTimeout(() => showSearchMenu(interaction), 1000);
}

/**
 * 상태 필터 표시
 */
export async function handleSearchStatus(interaction) {
    await showStatusFilter(interaction);
}

/**
 * 상태 선택 처리
 */
export async function handleSearchStatusSelect(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey) || {};
    
    const status = interaction.values[0];
    session.status = status === 'all' ? null : status;
    searchSessions.set(sessionKey, session);
    
    // 메뉴로 돌아가기
    await showSearchMenu(interaction);
}

/**
 * 담당자 선택
 */
export async function handleSearchAssignee(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey) || {};
    
    const userSelect = new UserSelectMenuBuilder()
        .setCustomId('search_assignee_select')
        .setPlaceholder('담당자를 선택하세요')
        .setMinValues(0)
        .setMaxValues(1);
    
    const components = [
        new ActionRowBuilder().addComponents(userSelect)
    ];
    
    await interaction.update({
        content: `👤 **담당자 필터**\n현재 선택: ${session.assignee ? `<@${session.assignee}>` : '전체'}`,
        embeds: [],
        components: components
    });
}

/**
 * 담당자 선택 처리
 */
export async function handleSearchAssigneeSelect(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey) || {};
    
    const assignee = interaction.values[0] || null;
    session.assignee = assignee;
    searchSessions.set(sessionKey, session);
    
    // 메뉴로 돌아가기
    await showSearchMenu(interaction);
}

/**
 * 날짜 범위 설정
 */
export async function handleSearchDate(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('search_date_modal')
        .setTitle('📅 기간 설정');
    
    const fromDateInput = new TextInputBuilder()
        .setCustomId('from_date')
        .setLabel('시작 날짜')
        .setPlaceholder('YYYY-MM-DD (예: 2025-01-01)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
    
    const toDateInput = new TextInputBuilder()
        .setCustomId('to_date')
        .setLabel('종료 날짜')
        .setPlaceholder('YYYY-MM-DD (예: 2025-01-31)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(fromDateInput),
        new ActionRowBuilder().addComponents(toDateInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 날짜 모달 제출 처리
 */
export async function handleSearchDateModal(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey) || {};
    
    const fromDate = interaction.fields.getTextInputValue('from_date');
    const toDate = interaction.fields.getTextInputValue('to_date');
    
    // 날짜 유효성 검사
    if (fromDate && !isValidDate(fromDate)) {
        await interaction.reply({
            content: '❌ 시작 날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    if (toDate && !isValidDate(toDate)) {
        await interaction.reply({
            content: '❌ 종료 날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    session.fromDate = fromDate || null;
    session.toDate = toDate || null;
    searchSessions.set(sessionKey, session);
    
    let message = '✅ 기간 설정: ';
    if (fromDate && toDate) {
        message += `${fromDate} ~ ${toDate}`;
    } else if (fromDate) {
        message += `${fromDate}부터`;
    } else if (toDate) {
        message += `${toDate}까지`;
    } else {
        message += '전체 기간';
    }
    
    await interaction.reply({
        content: message,
        flags: MessageFlags.Ephemeral
    });
    
    // 메뉴로 돌아가기
    setTimeout(() => showSearchMenu(interaction), 1000);
}

/**
 * 검색 실행
 */
export async function handleSearchExecute(interaction) {
    await executeSearch(interaction, 1);
}

/**
 * 검색 초기화
 */
export async function handleSearchReset(interaction) {
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
    
    await showSearchMenu(interaction);
}

/**
 * 검색 취소
 */
export async function handleSearchCancel(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    searchSessions.delete(sessionKey);
    
    await interaction.update({
        content: '✅ 검색이 취소되었습니다.',
        embeds: [],
        components: []
    });
}

/**
 * 페이지네이션 처리
 */
export async function handleSearchFirst(interaction) {
    await executeSearch(interaction, 1);
}

export async function handleSearchPrev(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey);
    if (session && session.page > 1) {
        await executeSearch(interaction, session.page - 1);
    }
}

export async function handleSearchNext(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey);
    if (session) {
        await executeSearch(interaction, session.page + 1);
    }
}

export async function handleSearchLast(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey);
    if (session) {
        // 총 페이지 수를 알기 위해 일단 현재 페이지로 검색
        const { advancedSearchTopics } = await import('../db/database.js');
        const result = advancedSearchTopics(interaction.guildId, {
            ...session,
            pageSize: 10
        });
        await executeSearch(interaction, result.totalPages);
    }
}

/**
 * 검색 조건 수정
 */
export async function handleSearchModify(interaction) {
    await showSearchMenu(interaction);
}

/**
 * 정렬 변경
 */
export async function handleSearchSort(interaction) {
    await showSortOptions(interaction);
}

/**
 * 정렬 선택 처리
 */
export async function handleSearchSortSelect(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey) || {};
    
    const [sort, order] = interaction.values[0].split('_');
    
    // 정렬 컬럼 매핑
    const sortMap = {
        'created': 'created_at',
        'updated': 'updated_at',
        'title': 'title',
        'status': 'status'
    };
    
    session.sort = sortMap[sort] || 'created_at';
    session.order = order.toUpperCase();
    searchSessions.set(sessionKey, session);
    
    // 검색 결과로 돌아가기
    await executeSearch(interaction, 1);
}

/**
 * 검색 닫기
 */
export async function handleSearchClose(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    searchSessions.delete(sessionKey);
    
    await interaction.update({
        content: '✅ 검색 결과를 닫았습니다.',
        embeds: [],
        components: []
    });
}

/**
 * 메뉴로 돌아가기
 */
export async function handleSearchBackToMenu(interaction) {
    await showSearchMenu(interaction);
}

/**
 * 결과로 돌아가기
 */
export async function handleSearchBackToResults(interaction) {
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = searchSessions.get(sessionKey);
    await executeSearch(interaction, session?.page || 1);
}

// 헬퍼 함수
function isValidDate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}