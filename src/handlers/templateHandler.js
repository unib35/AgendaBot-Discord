import {
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags
} from 'discord.js';
import {
    getTemplate,
    getTemplates,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    getGuildSettings
} from '../db/database.js';
import {
    isValidTemplateKey,
    renderTemplate,
    stringifyChecklist,
    parseChecklist,
    extractVariables,
    getDefaultVariables,
    generatePreview
} from '../utils/template.js';
import {
    showTemplateMainMenu,
    showTemplateList,
    showTemplateDetail,
    showTemplateHelp,
    templateSessions
} from '../commands/template.js';
import { addTopic, updateTopicThreadId } from '../db/database.js';

/**
 * 템플릿 빠른 사용 선택
 */
export async function handleTemplateQuickUse(interaction) {
    const templateKey = interaction.values[0];
    
    if (templateKey === '__more__') {
        await showTemplateList(interaction, 0);
        return;
    }
    
    const template = getTemplate(interaction.guildId, templateKey);
    if (!template) {
        await interaction.update({
            content: '❌ 템플릿을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 변수 확인
    const variables = extractVariables(template.title + ' ' + (template.body || ''));
    
    if (variables.length > 0) {
        // 변수 입력 모달 표시
        await showVariableInputModal(interaction, template);
    } else {
        // 변수 없으면 바로 생성 (interaction update 필요)
        await interaction.update({
            content: '⏳ 템플릿을 사용하여 안건을 생성하는 중...',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        await createAgendaFromTemplate(interaction, template, {});
    }
}

/**
 * 템플릿 선택 액션
 */
export async function handleTemplateSelectAction(interaction) {
    const templateKey = interaction.values[0];
    
    // 세션에 선택된 템플릿 저장
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    templateSessions.set(sessionKey, { selectedTemplate: templateKey });
    
    // 액션 선택 메뉴 표시
    const template = getTemplate(interaction.guildId, templateKey);
    if (!template) {
        await interaction.update({
            content: '❌ 템플릿을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📄 ${template.title}`)
        .setDescription('원하는 작업을 선택하세요.')
        .addFields({
            name: '템플릿 키',
            value: `\`${template.key}\``,
            inline: true
        })
        .setTimestamp();
    
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`template_use:${template.key}`)
            .setLabel('사용하기')
            .setEmoji('🚀')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`template_view:${template.key}`)
            .setLabel('상세보기')
            .setEmoji('👁️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`template_update:${template.key}`)
            .setLabel('수정')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Primary),
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
    
    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(buttons)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 새 템플릿 추가 버튼
 */
export async function handleTemplateAddNew(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('template_add_key_modal')
        .setTitle('📝 새 템플릿 만들기 - 1단계');
    
    const keyInput = new TextInputBuilder()
        .setCustomId('template_key')
        .setLabel('템플릿 키 (영문, 숫자, 하이픈만 사용)')
        .setPlaceholder('예: weekly-meeting, bug-report, sprint-review')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(50);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(keyInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 템플릿 키 입력 모달 처리
 */
export async function handleTemplateAddKeyModal(interaction) {
    const key = interaction.fields.getTextInputValue('template_key').toLowerCase();
    
    // 키 유효성 검사
    if (!isValidTemplateKey(key)) {
        await interaction.reply({
            content: '❌ 템플릿 키는 영문, 숫자, 하이픈, 언더스코어만 사용 가능합니다. (3-50자)',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 중복 검사
    const existing = getTemplate(interaction.guildId, key);
    if (existing) {
        await interaction.reply({
            content: `❌ \`${key}\` 키를 가진 템플릿이 이미 존재합니다.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 세션에 키 저장
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    templateSessions.set(sessionKey, { key, step: 'content' });
    
    // 내용 입력 단계 안내 (모달을 연속으로 표시할 수 없으므로 버튼으로 진행)
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('✅ 템플릿 키 설정 완료')
        .setDescription(`템플릿 키: \`${key}\`\n\n아래 버튼을 눌러 템플릿 내용을 입력하세요.`)
        .setTimestamp();
    
    const button = new ButtonBuilder()
        .setCustomId(`template_add_content:${key}`)
        .setLabel('템플릿 내용 입력')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary);
    
    await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(button)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 템플릿 내용 입력 버튼 처리
 */
export async function handleTemplateAddContent(interaction) {
    const key = interaction.customId.split(':')[1];
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = templateSessions.get(sessionKey);
    
    if (!session || session.key !== key) {
        await interaction.reply({
            content: '❌ 세션이 만료되었습니다. 다시 시도해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 내용 입력 모달 표시
    const contentModal = new ModalBuilder()
        .setCustomId('template_add_content_modal')
        .setTitle('📝 새 템플릿 만들기 - 2단계');
    
    const titleInput = new TextInputBuilder()
        .setCustomId('template_title')
        .setLabel('템플릿 제목')
        .setPlaceholder('예: {{year}}년 {{month}}월 주간 회의')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);
    
    const bodyInput = new TextInputBuilder()
        .setCustomId('template_body')
        .setLabel('템플릿 내용 (선택)')
        .setPlaceholder('변수 사용 가능: {{변수명}}\n기본 변수: {{today}}, {{year}}, {{month}}, {{day}}, {{weekday}}')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000);
    
    const checklistInput = new TextInputBuilder()
        .setCustomId('template_checklist')
        .setLabel('체크리스트 (선택, 한 줄에 하나씩)')
        .setPlaceholder('프로젝트 현황 공유\n이슈 논의\nQ&A')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);
    
    contentModal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(bodyInput),
        new ActionRowBuilder().addComponents(checklistInput)
    );
    
    await interaction.showModal(contentModal);
}

/**
 * 템플릿 내용 입력 모달 처리
 */
export async function handleTemplateAddContentModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    const session = templateSessions.get(sessionKey);
    
    if (!session || !session.key) {
        await interaction.editReply({
            content: '❌ 세션이 만료되었습니다. 다시 시도해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const title = interaction.fields.getTextInputValue('template_title');
    const body = interaction.fields.getTextInputValue('template_body') || '';
    const checklistInput = interaction.fields.getTextInputValue('template_checklist') || '';
    
    // 체크리스트 파싱
    const checklistItems = checklistInput
        .split('\n')
        .filter(item => item.trim())
        .map(item => item.trim());
    
    try {
        // 템플릿 저장
        const templateId = addTemplate({
            guild_id: interaction.guildId,
            key: session.key,
            title,
            body,
            checklist: stringifyChecklist(checklistItems),
            visibility: 'guild',
            created_by: interaction.user.id
        });
        
        // 미리보기 생성
        const template = {
            key: session.key,
            title,
            body,
            checklist: stringifyChecklist(checklistItems)
        };
        const preview = generatePreview(template);
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 템플릿 생성 완료')
            .setDescription(`\`${session.key}\` 템플릿이 성공적으로 생성되었습니다.`)
            .addFields(
                {
                    name: '📝 미리보기',
                    value: `**제목**: ${preview.title}\n**내용**: ${preview.body || '_없음_'}`.substring(0, 1024),
                    inline: false
                }
            )
            .setTimestamp();
        
        if (checklistItems.length > 0) {
            embed.addFields({
                name: `✅ 체크리스트 (${checklistItems.length}개)`,
                value: checklistItems.slice(0, 5).map((item, idx) => `${idx + 1}. ${item}`).join('\n') +
                       (checklistItems.length > 5 ? `\n... 외 ${checklistItems.length - 5}개` : ''),
                inline: false
            });
        }
        
        const buttons = [
            new ButtonBuilder()
                .setCustomId(`template_use:${session.key}`)
                .setLabel('바로 사용하기')
                .setEmoji('🚀')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('template_main_menu')
                .setLabel('메인 메뉴')
                .setEmoji('🏠')
                .setStyle(ButtonStyle.Primary)
        ];
        
        await interaction.editReply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(buttons)],
            flags: MessageFlags.Ephemeral
        });
        
        // 세션 정리
        templateSessions.delete(sessionKey);
        
    } catch (error) {
        console.error('템플릿 생성 중 오류:', error);
        await interaction.editReply({
            content: `❌ 템플릿 생성 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 템플릿 사용
 */
export async function handleTemplateUse(interaction) {
    const templateKey = interaction.customId.split(':')[1];
    const template = getTemplate(interaction.guildId, templateKey);
    
    if (!template) {
        await interaction.update({
            content: '❌ 템플릿을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 변수 확인
    const variables = extractVariables(template.title + ' ' + (template.body || ''));
    
    if (variables.length > 0) {
        // 변수 입력 모달 표시
        await showVariableInputModal(interaction, template);
    } else {
        // 변수 없으면 바로 생성
        await interaction.deferUpdate();
        await createAgendaFromTemplate(interaction, template, {});
    }
}

/**
 * 변수 입력 모달 표시
 */
async function showVariableInputModal(interaction, template) {
    const variables = extractVariables(template.title + ' ' + (template.body || ''));
    
    const modal = new ModalBuilder()
        .setCustomId(`template_use_variables:${template.key}`)
        .setTitle('📝 템플릿 변수 입력');
    
    // 최대 5개 변수만 모달로 입력 (Discord 제한)
    const varsToShow = variables.slice(0, 5);
    
    for (const variable of varsToShow) {
        const input = new TextInputBuilder()
            .setCustomId(`var_${variable}`)
            .setLabel(variable.replace(/_/g, ' ').toUpperCase())
            .setPlaceholder(`${variable} 값을 입력하세요`)
            .setStyle(TextInputStyle.Short)
            .setRequired(false);
        
        modal.addComponents(
            new ActionRowBuilder().addComponents(input)
        );
    }
    
    // 변수가 5개를 초과하면 경고
    if (variables.length > 5) {
        const remainingVars = variables.slice(5);
        const warningInput = new TextInputBuilder()
            .setCustomId('var_warning')
            .setLabel(`추가 변수: ${remainingVars.join(', ')}`)
            .setValue('위 변수들은 기본값으로 처리됩니다')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);
        
        if (modal.components.length < 5) {
            modal.addComponents(
                new ActionRowBuilder().addComponents(warningInput)
            );
        }
    }
    
    await interaction.showModal(modal);
}

/**
 * 변수 입력 모달 처리
 */
export async function handleTemplateVariablesModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const templateKey = interaction.customId.split(':')[1];
    const template = getTemplate(interaction.guildId, templateKey);
    
    if (!template) {
        await interaction.editReply({
            content: '❌ 템플릿을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 입력된 변수 수집
    const userVariables = {};
    const fields = interaction.fields.fields;
    
    fields.forEach((field, key) => {
        if (key.startsWith('var_') && key !== 'var_warning') {
            const varName = key.substring(4);
            const value = field.value;
            if (value) {
                userVariables[varName] = value;
            }
        }
    });
    
    await createAgendaFromTemplate(interaction, template, userVariables);
}

/**
 * 템플릿으로부터 안건 생성
 */
async function createAgendaFromTemplate(interaction, template, userVariables) {
    const settings = getGuildSettings(interaction.guildId);
    
    if (!settings?.tracking_channel_id) {
        await interaction.editReply({
            content: '❌ 트래킹 채널이 설정되지 않았습니다. `/setup` 명령어로 설정해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 변수 병합
    const defaultVars = getDefaultVariables();
    const variables = { ...defaultVars, ...userVariables };
    
    // 템플릿 렌더링
    const title = renderTemplate(template.title, variables);
    const body = renderTemplate(template.body || '', variables);
    const checklist = parseChecklist(template.checklist);
    
    try {
        // 안건 생성
        const topicId = addTopic({
            guild_id: interaction.guildId,
            channel_id: settings.tracking_channel_id,
            message_id: '0', // 임시
            title,
            status: '진행중',
            created_by: interaction.user.id
        });
        
        // 메시지 생성
        const channel = await interaction.guild.channels.fetch(settings.tracking_channel_id);
        if (!channel?.isTextBased()) {
            throw new Error('트래킹 채널을 찾을 수 없습니다.');
        }
        
        // 메시지 내용 구성
        let content = `## 📌 [#${topicId}] ${title}\n\n`;
        if (body) {
            content += `${body}\n\n`;
        }
        content += `### 상태\n진행중\n\n`;
        content += `### 담당자\n<@${interaction.user.id}>\n\n`;
        
        if (checklist.length > 0) {
            content += `### 체크리스트\n`;
            checklist.forEach(item => {
                content += `- [ ] ${item}\n`;
            });
            content += '\n';
        }
        
        content += `### 생성일\n${new Date().toLocaleDateString('ko-KR')}\n\n`;
        content += `### 링크\n_미정_`;
        
        // 메시지 전송
        const message = await channel.send(content);
        
        // 스레드 생성
        const thread = await message.startThread({
            name: `[진행중] ${title}`.substring(0, 100),
            autoArchiveDuration: 10080,
            reason: `안건 #${topicId} 논의`
        });
        
        // 스레드 ID 업데이트
        updateTopicThreadId(topicId, thread.id);
        
        // 성공 응답
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 템플릿으로 안건 생성 완료')
            .setDescription(`템플릿 \`${template.key}\`를 사용하여 안건이 생성되었습니다.`)
            .addFields(
                { name: '안건 번호', value: `#${topicId}`, inline: true },
                { name: '제목', value: title, inline: false },
                { name: '채널', value: `<#${settings.tracking_channel_id}>`, inline: true },
                { name: '스레드', value: `<#${thread.id}>`, inline: true }
            )
            .setTimestamp();
        
        if (checklist.length > 0) {
            embed.addFields({
                name: `체크리스트 (${checklist.length}개)`,
                value: checklist.slice(0, 5).join('\n') +
                       (checklist.length > 5 ? `\n... 외 ${checklist.length - 5}개` : ''),
                inline: false
            });
        }
        
        await interaction.editReply({
            embeds: [embed],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('안건 생성 중 오류:', error);
        await interaction.editReply({
            content: `❌ 안건 생성 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 템플릿 업데이트
 */
export async function handleTemplateUpdate(interaction) {
    const templateKey = interaction.customId.split(':')[1];
    const template = getTemplate(interaction.guildId, templateKey);
    
    if (!template) {
        await interaction.update({
            content: '❌ 템플릿을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 업데이트 모달 표시
    const modal = new ModalBuilder()
        .setCustomId(`template_update_modal:${templateKey}`)
        .setTitle(`📝 템플릿 수정 - ${templateKey}`);
    
    const titleInput = new TextInputBuilder()
        .setCustomId('template_title')
        .setLabel('템플릿 제목')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(template.title)
        .setMaxLength(100);
    
    const bodyInput = new TextInputBuilder()
        .setCustomId('template_body')
        .setLabel('템플릿 내용')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue(template.body || '')
        .setMaxLength(1000);
    
    const checklistItems = parseChecklist(template.checklist);
    const checklistInput = new TextInputBuilder()
        .setCustomId('template_checklist')
        .setLabel('체크리스트 (한 줄에 하나씩)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue(checklistItems.join('\n'))
        .setMaxLength(500);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(bodyInput),
        new ActionRowBuilder().addComponents(checklistInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 템플릿 업데이트 모달 처리
 */
export async function handleTemplateUpdateModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const templateKey = interaction.customId.split(':')[1];
    
    const title = interaction.fields.getTextInputValue('template_title');
    const body = interaction.fields.getTextInputValue('template_body') || '';
    const checklistInput = interaction.fields.getTextInputValue('template_checklist') || '';
    
    // 체크리스트 파싱
    const checklistItems = checklistInput
        .split('\n')
        .filter(item => item.trim())
        .map(item => item.trim());
    
    try {
        const success = updateTemplate(interaction.guildId, templateKey, {
            title,
            body,
            checklist: stringifyChecklist(checklistItems)
        });
        
        if (!success) {
            throw new Error('템플릿을 찾을 수 없습니다.');
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 템플릿 수정 완료')
            .setDescription(`\`${templateKey}\` 템플릿이 성공적으로 수정되었습니다.`)
            .setTimestamp();
        
        const buttons = [
            new ButtonBuilder()
                .setCustomId(`template_view:${templateKey}`)
                .setLabel('상세보기')
                .setEmoji('👁️')
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
        
    } catch (error) {
        console.error('템플릿 수정 중 오류:', error);
        await interaction.editReply({
            content: `❌ 템플릿 수정 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 템플릿 삭제
 */
export async function handleTemplateDelete(interaction) {
    const templateKey = interaction.customId.split(':')[1];
    const template = getTemplate(interaction.guildId, templateKey);
    
    if (!template) {
        await interaction.update({
            content: '❌ 템플릿을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 삭제 확인
    const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('⚠️ 템플릿 삭제 확인')
        .setDescription(`정말로 \`${templateKey}\` 템플릿을 삭제하시겠습니까?`)
        .addFields(
            { name: '템플릿 제목', value: template.title, inline: false }
        )
        .setFooter({ text: '이 작업은 되돌릴 수 없습니다.' })
        .setTimestamp();
    
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`template_delete_confirm:${templateKey}`)
            .setLabel('삭제')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('template_cancel')
            .setLabel('취소')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary)
    ];
    
    await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(buttons)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 템플릿 삭제 확인
 */
export async function handleTemplateDeleteConfirm(interaction) {
    const templateKey = interaction.customId.split(':')[1];
    
    try {
        const success = deleteTemplate(interaction.guildId, templateKey);
        
        if (!success) {
            throw new Error('템플릿을 찾을 수 없습니다.');
        }
        
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 템플릿 삭제 완료')
            .setDescription(`\`${templateKey}\` 템플릿이 삭제되었습니다.`)
            .setTimestamp();
        
        await interaction.update({
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('template_main_menu')
                        .setLabel('메인 메뉴')
                        .setEmoji('🏠')
                        .setStyle(ButtonStyle.Primary)
                )
            ],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('템플릿 삭제 중 오류:', error);
        await interaction.update({
            content: `❌ 템플릿 삭제 중 오류가 발생했습니다: ${error.message}`,
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 기타 버튼 핸들러
 */
export async function handleTemplateMainMenu(interaction) {
    await interaction.deferUpdate();
    await showTemplateMainMenu(interaction);
}

export async function handleTemplateListAll(interaction) {
    await interaction.deferUpdate();
    await showTemplateList(interaction, 0);
}

export async function handleTemplateView(interaction) {
    const templateKey = interaction.customId.split(':')[1];
    await interaction.deferUpdate();
    await showTemplateDetail(interaction, templateKey);
}

export async function handleTemplateHelp(interaction) {
    await interaction.deferUpdate();
    await showTemplateHelp(interaction);
}

export async function handleTemplateSearch(interaction) {
    // 검색 모달 표시
    const modal = new ModalBuilder()
        .setCustomId('template_search_modal')
        .setTitle('🔍 템플릿 검색');
    
    const searchInput = new TextInputBuilder()
        .setCustomId('search_query')
        .setLabel('검색어 입력 (키 또는 제목)')
        .setPlaceholder('예: weekly, 회의, bug')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(searchInput)
    );
    
    await interaction.showModal(modal);
}

export async function handleTemplateSearchModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const query = interaction.fields.getTextInputValue('search_query').toLowerCase();
    const templates = getTemplates(interaction.guildId);
    
    // 검색 필터링
    const filtered = templates.filter(t => 
        t.key.toLowerCase().includes(query) ||
        t.title.toLowerCase().includes(query) ||
        (t.body && t.body.toLowerCase().includes(query))
    );
    
    if (filtered.length === 0) {
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('🔍 검색 결과 없음')
            .setDescription(`"${query}"에 대한 검색 결과가 없습니다.`)
            .setTimestamp();
        
        const button = new ButtonBuilder()
            .setCustomId('template_main_menu')
            .setLabel('메인 메뉴')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Primary);
        
        await interaction.editReply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 검색 결과 표시
    await showTemplateList(interaction, 0, query);
}

export async function handleTemplateCancel(interaction) {
    await interaction.update({
        content: '❌ 작업이 취소되었습니다.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
}

export async function handleTemplateListNavigation(interaction) {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const currentPage = parts[2] ? parseInt(parts[2]) : 0;
    const filter = parts[3] || null;
    
    let newPage = currentPage;
    const templates = getTemplates(interaction.guildId);
    const itemsPerPage = 5;
    const totalPages = Math.ceil(templates.length / itemsPerPage);
    
    switch (action) {
        case 'first':
            newPage = 0;
            break;
        case 'prev':
            newPage = Math.max(0, currentPage - 1);
            break;
        case 'next':
            newPage = Math.min(totalPages - 1, currentPage + 1);
            break;
        case 'last':
            newPage = totalPages - 1;
            break;
    }
    
    await interaction.deferUpdate();
    await showTemplateList(interaction, newPage, filter);
}