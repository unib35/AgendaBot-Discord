import {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} from 'discord.js';
import {
    getTemplates,
    getTemplate
} from '../db/database.js';
import {
    generatePreview,
    getDefaultVariables,
    parseChecklist
} from '../utils/template.js';
import { ensurePermissions } from '../utils/guards.js';

// 세션 저장소
export const templateSessions = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('template')
        .setDescription('📝 템플릿 라이브러리 - 재사용 가능한 안건 템플릿 관리'),

    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        // 메인 메뉴 표시
        await showTemplateMainMenu(interaction);
    }
};

/**
 * 템플릿 메인 메뉴 표시
 */
export async function showTemplateMainMenu(interaction) {
    const templates = getTemplates(interaction.guildId);
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📚 템플릿 라이브러리')
        .setDescription(templates.length > 0 
            ? `${templates.length}개의 템플릿이 있습니다.\n아래 메뉴에서 원하는 작업을 선택하세요.`
            : '아직 템플릿이 없습니다.\n**➕ 새 템플릿 추가**를 눌러 첫 템플릿을 만들어보세요!')
        .setTimestamp();
    
    const components = [];
    
    // 빠른 사용 드롭다운 (템플릿이 있을 때만)
    if (templates.length > 0) {
        const quickUseMenu = new StringSelectMenuBuilder()
            .setCustomId('template_quick_use')
            .setPlaceholder('🚀 템플릿 바로 사용하기')
            .addOptions(
                templates.slice(0, 24).map(t => ({
                    label: t.title.substring(0, 50),
                    description: `키: ${t.key}`,
                    value: t.key,
                    emoji: '📄'
                }))
            );
        
        if (templates.length > 24) {
            quickUseMenu.addOptions({
                label: '더 보기...',
                description: '전체 목록 보기',
                value: '__more__',
                emoji: '📋'
            });
        }
        
        components.push(
            new ActionRowBuilder().addComponents(quickUseMenu)
        );
    }
    
    // 주요 액션 버튼
    const actionButtons = [
        new ButtonBuilder()
            .setCustomId('template_add_new')
            .setLabel('새 템플릿 추가')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('template_list_all')
            .setLabel('전체 목록')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(templates.length === 0),
        new ButtonBuilder()
            .setCustomId('template_search')
            .setLabel('검색')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(templates.length === 0),
        new ButtonBuilder()
            .setCustomId('template_help')
            .setLabel('도움말')
            .setEmoji('❓')
            .setStyle(ButtonStyle.Secondary)
    ];
    
    components.push(
        new ActionRowBuilder().addComponents(actionButtons)
    );
    
    // 최근 템플릿 미리보기 (3개)
    if (templates.length > 0) {
        const recentTemplates = templates.slice(0, 3);
        for (const template of recentTemplates) {
            const preview = generatePreview(template);
            embed.addFields({
                name: `📄 ${template.title}`,
                value: `키: \`${template.key}\`\n${preview.body ? preview.body.substring(0, 100) + (preview.body.length > 100 ? '...' : '') : '_내용 없음_'}`,
                inline: false
            });
        }
    }
    
    const response = {
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    };
    
    if (interaction.replied || interaction.deferred) {
        await interaction.editReply(response);
    } else {
        await interaction.reply(response);
    }
}

/**
 * 템플릿 목록 표시 (페이지네이션)
 */
export async function showTemplateList(interaction, page = 0, filter = null) {
    let templates = getTemplates(interaction.guildId);
    
    // 필터링
    if (filter) {
        templates = templates.filter(t => 
            t.key.toLowerCase().includes(filter.toLowerCase()) ||
            t.title.toLowerCase().includes(filter.toLowerCase())
        );
    }
    
    const itemsPerPage = 5;
    const totalPages = Math.ceil(templates.length / itemsPerPage);
    const currentPage = Math.min(Math.max(0, page), totalPages - 1);
    
    const start = currentPage * itemsPerPage;
    const end = start + itemsPerPage;
    const pageTemplates = templates.slice(start, end);
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📋 템플릿 목록 ${filter ? `(검색: ${filter})` : ''}`)
        .setDescription(templates.length > 0 
            ? `총 ${templates.length}개 템플릿 | 페이지 ${currentPage + 1}/${totalPages}`
            : '템플릿이 없습니다.')
        .setTimestamp();
    
    // 템플릿 정보 표시
    for (const template of pageTemplates) {
        const preview = generatePreview(template);
        const checklist = parseChecklist(template.checklist);
        
        let fieldValue = `키: \`${template.key}\`\n`;
        fieldValue += `${preview.body ? preview.body.substring(0, 150) + (preview.body.length > 150 ? '...' : '') : '_내용 없음_'}\n`;
        if (checklist.length > 0) {
            fieldValue += `📝 체크리스트: ${checklist.length}개 항목`;
        }
        
        embed.addFields({
            name: `${template.title}`,
            value: fieldValue,
            inline: false
        });
    }
    
    const components = [];
    
    // 템플릿 선택 드롭다운
    if (pageTemplates.length > 0) {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('template_select_action')
            .setPlaceholder('🎯 템플릿 선택하여 작업하기')
            .addOptions(
                pageTemplates.map(t => ({
                    label: t.title.substring(0, 50),
                    description: `키: ${t.key}`,
                    value: t.key,
                    emoji: '📄'
                }))
            );
        
        components.push(
            new ActionRowBuilder().addComponents(selectMenu)
        );
    }
    
    // 페이지네이션 버튼
    const navigationButtons = [];
    
    if (totalPages > 1) {
        navigationButtons.push(
            new ButtonBuilder()
                .setCustomId(`template_list:first:${filter || ''}`)
                .setLabel('처음')
                .setEmoji('⏮️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId(`template_list:prev:${currentPage}:${filter || ''}`)
                .setLabel('이전')
                .setEmoji('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage === 0),
            new ButtonBuilder()
                .setCustomId(`template_list:page:${currentPage}`)
                .setLabel(`${currentPage + 1} / ${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`template_list:next:${currentPage}:${filter || ''}`)
                .setLabel('다음')
                .setEmoji('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1),
            new ButtonBuilder()
                .setCustomId(`template_list:last:${filter || ''}`)
                .setLabel('마지막')
                .setEmoji('⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(currentPage >= totalPages - 1)
        );
    }
    
    // 액션 버튼
    navigationButtons.push(
        new ButtonBuilder()
            .setCustomId('template_main_menu')
            .setLabel('메인 메뉴')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Primary)
    );
    
    if (navigationButtons.length > 0) {
        // 5개씩 나누어 배치
        for (let i = 0; i < navigationButtons.length; i += 5) {
            components.push(
                new ActionRowBuilder().addComponents(
                    navigationButtons.slice(i, i + 5)
                )
            );
        }
    }
    
    await interaction.editReply({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 템플릿 상세 보기
 */
export async function showTemplateDetail(interaction, templateKey) {
    const template = getTemplate(interaction.guildId, templateKey);
    
    if (!template) {
        await interaction.editReply({
            content: '❌ 템플릿을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const preview = generatePreview(template);
    const variables = extractVariables(template.title + ' ' + (template.body || ''));
    const checklist = parseChecklist(template.checklist);
    const defaultVars = getDefaultVariables();
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📄 ${template.title}`)
        .setDescription(`템플릿 키: \`${template.key}\``)
        .addFields(
            {
                name: '📝 미리보기',
                value: `**제목**: ${preview.title}\n\n**내용**:\n${preview.body || '_내용 없음_'}`.substring(0, 1024),
                inline: false
            }
        )
        .setFooter({ text: `생성자: ${template.created_by} | 생성일: ${new Date(template.created_at * 1000).toLocaleDateString('ko-KR')}` })
        .setTimestamp();
    
    // 체크리스트 표시
    if (checklist.length > 0) {
        embed.addFields({
            name: `✅ 체크리스트 (${checklist.length}개 항목)`,
            value: checklist.slice(0, 10).map((item, idx) => `${idx + 1}. ${item}`).join('\n') +
                   (checklist.length > 10 ? `\n... 외 ${checklist.length - 10}개` : ''),
            inline: false
        });
    }
    
    // 변수 정보
    if (variables.length > 0) {
        embed.addFields({
            name: '🔤 사용 가능한 변수',
            value: `**사용자 정의**: ${variables.join(', ')}\n**기본 제공**: today, year, month, day, weekday`,
            inline: false
        });
    }
    
    // 액션 버튼
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`template_use:${template.key}`)
            .setLabel('사용하기')
            .setEmoji('🚀')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`template_update:${template.key}`)
            .setLabel('수정')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`template_duplicate:${template.key}`)
            .setLabel('복제')
            .setEmoji('📑')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`template_delete:${template.key}`)
            .setLabel('삭제')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('template_list_all')
            .setLabel('목록으로')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary)
    ];
    
    const components = [];
    for (let i = 0; i < buttons.length; i += 5) {
        components.push(
            new ActionRowBuilder().addComponents(
                buttons.slice(i, i + 5)
            )
        );
    }
    
    await interaction.editReply({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 템플릿 도움말 표시
 */
export async function showTemplateHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('❓ 템플릿 시스템 도움말')
        .setDescription('템플릿을 사용하여 자주 사용하는 안건 형식을 저장하고 재사용할 수 있습니다.')
        .addFields(
            {
                name: '📝 템플릿이란?',
                value: '반복적으로 사용하는 안건 형식을 미리 저장해두고, 필요할 때 빠르게 재사용할 수 있는 기능입니다.',
                inline: false
            },
            {
                name: '🔤 변수 시스템',
                value: '`{{변수명}}` 형식으로 변수를 사용할 수 있습니다.\n예: `{{today}}`, `{{project_name}}`, `{{sprint_number}}`',
                inline: false
            },
            {
                name: '📅 기본 제공 변수',
                value: '• `{{today}}` - 오늘 날짜 (YYYY-MM-DD)\n• `{{year}}` - 연도\n• `{{month}}` - 월 (01-12)\n• `{{day}}` - 일 (01-31)\n• `{{weekday}}` - 요일 (월, 화, 수...)',
                inline: false
            },
            {
                name: '✅ 체크리스트',
                value: '템플릿에 체크리스트를 포함시켜 할 일 목록을 미리 정의할 수 있습니다.',
                inline: false
            },
            {
                name: '💡 활용 예시',
                value: '• **주간 회의**: 매주 반복되는 회의 안건\n• **버그 리포트**: 표준화된 버그 보고 양식\n• **프로젝트 킥오프**: 새 프로젝트 시작 체크리스트\n• **일일 스탠드업**: 데일리 미팅 템플릿',
                inline: false
            }
        )
        .setFooter({ text: '템플릿을 활용하여 업무 효율을 높여보세요!' })
        .setTimestamp();
    
    const buttons = [
        new ButtonBuilder()
            .setCustomId('template_add_new')
            .setLabel('템플릿 만들기')
            .setEmoji('➕')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('template_main_menu')
            .setLabel('메인 메뉴')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Secondary)
    ];
    
    await interaction.editReply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(buttons)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 변수 추출
 */
function extractVariables(text) {
    if (!text) return [];
    
    const matches = text.match(/\{\{(\w+)\}\}/g);
    if (!matches) return [];
    
    const variables = new Set();
    const defaultVars = new Set(['today', 'year', 'month', 'day', 'weekday']);
    
    matches.forEach(match => {
        const variable = match.replace(/\{\{|\}\}/g, '');
        if (!defaultVars.has(variable)) {
            variables.add(variable);
        }
    });
    
    return Array.from(variables);
}