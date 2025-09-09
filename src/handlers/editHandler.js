import {
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    UserSelectMenuBuilder,
    MessageFlags
} from 'discord.js';
import { 
    getTopic,
    getTopics
} from '../db/database.js';
import {
    showEditMenu,
    showEditOptions,
    updateTopicMessage,
    editSessions
} from '../commands/edit.js';

/**
 * 안건 선택 처리
 */
export async function handleEditTopicSelect(interaction) {
    const topicId = parseInt(interaction.values[0]);
    await showEditOptions(interaction, topicId);
}

/**
 * 제목 수정 버튼 처리
 */
export async function handleEditTitle(interaction) {
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 제목 수정 모달
    const modal = new ModalBuilder()
        .setCustomId(`edit_title_modal:${topicId}`)
        .setTitle(`📝 제목 수정 - 안건 #${topicId}`);
    
    const titleInput = new TextInputBuilder()
        .setCustomId('new_title')
        .setLabel('새 제목')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(topic.title)
        .setMaxLength(200);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 제목 수정 모달 처리
 */
export async function handleEditTitleModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const newTitle = interaction.fields.getTextInputValue('new_title');
    
    const topic = getTopic(topicId);
    if (!topic) {
        await interaction.editReply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        // 메시지 업데이트
        await updateTopicMessage(interaction.guild, topic, { title: newTitle });
        
        // 성공 메시지
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 제목 수정 완료')
            .setDescription(`안건 #${topicId}의 제목이 수정되었습니다.`)
            .addFields(
                { name: '이전 제목', value: topic.title, inline: false },
                { name: '새 제목', value: newTitle, inline: false }
            )
            .setTimestamp();
        
        await interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('제목 수정 중 오류:', error);
        await interaction.editReply({
            content: `❌ 제목 수정 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 내용 수정 버튼 처리
 */
export async function handleEditBody(interaction) {
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 현재 내용 가져오기
    let currentBody = '';
    try {
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(topic.message_id);
            if (message) {
                const lines = message.content.split('\n');
                const titleIndex = lines.findIndex(line => line.startsWith('## 📌'));
                let bodyStart = titleIndex + 2;
                let bodyEnd = lines.findIndex((line, idx) => idx > bodyStart && line.startsWith('###'));
                if (bodyEnd === -1) bodyEnd = lines.length;
                currentBody = lines.slice(bodyStart, bodyEnd).join('\n').trim();
            }
        }
    } catch (error) {
        console.error('내용 가져오기 실패:', error);
    }
    
    // 내용 수정 모달
    const modal = new ModalBuilder()
        .setCustomId(`edit_body_modal:${topicId}`)
        .setTitle(`📄 내용 수정 - 안건 #${topicId}`);
    
    const bodyInput = new TextInputBuilder()
        .setCustomId('new_body')
        .setLabel('새 내용')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue(currentBody)
        .setMaxLength(1000);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(bodyInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 내용 수정 모달 처리
 */
export async function handleEditBodyModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const newBody = interaction.fields.getTextInputValue('new_body') || '';
    
    const topic = getTopic(topicId);
    if (!topic) {
        await interaction.editReply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        // 메시지 업데이트
        await updateTopicMessage(interaction.guild, topic, { body: newBody });
        
        // 성공 메시지
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 내용 수정 완료')
            .setDescription(`안건 #${topicId}의 내용이 수정되었습니다.`)
            .setTimestamp();
        
        if (newBody) {
            embed.addFields({
                name: '새 내용',
                value: newBody.substring(0, 1024),
                inline: false
            });
        }
        
        await interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('내용 수정 중 오류:', error);
        await interaction.editReply({
            content: `❌ 내용 수정 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 체크리스트 수정 버튼 처리
 */
export async function handleEditChecklist(interaction) {
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 현재 체크리스트 가져오기
    let currentChecklist = [];
    try {
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(topic.message_id);
            if (message) {
                const lines = message.content.split('\n');
                const checklistIndex = lines.findIndex(line => line.includes('### 체크리스트'));
                
                if (checklistIndex !== -1) {
                    for (let i = checklistIndex + 1; i < lines.length; i++) {
                        if (lines[i].startsWith('###')) break;
                        // ⬜ 또는 ☑️로 시작하는 항목 찾기
                        if (lines[i].startsWith('⬜ ')) {
                            currentChecklist.push(lines[i].substring(2).trim());
                        } else if (lines[i].startsWith('☑️ ')) {
                            currentChecklist.push(lines[i].substring(2).trim());
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('체크리스트 가져오기 실패:', error);
    }
    
    // 체크리스트 수정 모달
    const modal = new ModalBuilder()
        .setCustomId(`edit_checklist_modal:${topicId}`)
        .setTitle(`✅ 체크리스트 수정 - 안건 #${topicId}`);
    
    const checklistInput = new TextInputBuilder()
        .setCustomId('new_checklist')
        .setLabel('체크리스트 항목 (한 줄에 하나씩)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue(currentChecklist.join('\n'))
        .setMaxLength(500);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(checklistInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 체크리스트 수정 모달 처리
 */
export async function handleEditChecklistModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const checklistInput = interaction.fields.getTextInputValue('new_checklist') || '';
    
    const topic = getTopic(topicId);
    if (!topic) {
        await interaction.editReply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 체크리스트 파싱
    const checklist = checklistInput
        .split('\n')
        .filter(item => item.trim())
        .map(item => item.trim());
    
    try {
        // 메시지 업데이트
        await updateTopicMessage(interaction.guild, topic, { checklist });
        
        // 성공 메시지
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 체크리스트 수정 완료')
            .setDescription(`안건 #${topicId}의 체크리스트가 수정되었습니다.`)
            .setTimestamp();
        
        if (checklist.length > 0) {
            embed.addFields({
                name: `체크리스트 (${checklist.length}개 항목)`,
                value: checklist.slice(0, 10).map((item, idx) => `${idx + 1}. ${item}`).join('\n') +
                       (checklist.length > 10 ? `\n... 외 ${checklist.length - 10}개` : ''),
                inline: false
            });
        }
        
        await interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('체크리스트 수정 중 오류:', error);
        await interaction.editReply({
            content: `❌ 체크리스트 수정 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 담당자 수정 버튼 처리
 */
export async function handleEditAssignees(interaction) {
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 담당자 선택 메뉴
    const userSelect = new UserSelectMenuBuilder()
        .setCustomId(`edit_assignees_select:${topicId}`)
        .setPlaceholder('담당자를 선택하세요 (최대 5명)')
        .setMinValues(1)
        .setMaxValues(5);
    
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`👥 담당자 수정 - 안건 #${topicId}`)
        .setDescription('새로운 담당자를 선택하세요.')
        .setTimestamp();
    
    await interaction.reply({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(userSelect)],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 담당자 선택 처리
 */
export async function handleEditAssigneesSelect(interaction) {
    await interaction.deferUpdate();
    
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const selectedUsers = interaction.values;
    
    const topic = getTopic(topicId);
    if (!topic) {
        await interaction.editReply({
            content: '❌ 안건을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        // 메시지 업데이트
        await updateTopicMessage(interaction.guild, topic, { assignees: selectedUsers });
        
        // 성공 메시지
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 담당자 수정 완료')
            .setDescription(`안건 #${topicId}의 담당자가 수정되었습니다.`)
            .addFields({
                name: '새 담당자',
                value: selectedUsers.map(id => `<@${id}>`).join(', '),
                inline: false
            })
            .setTimestamp();
        
        await interaction.editReply({
            embeds: [embed],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('담당자 수정 중 오류:', error);
        await interaction.editReply({
            content: `❌ 담당자 수정 중 오류가 발생했습니다: ${error.message}`,
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 날짜 수정 버튼 처리
 */
export async function handleEditDate(interaction) {
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 날짜 수정 모달
    const modal = new ModalBuilder()
        .setCustomId(`edit_date_modal:${topicId}`)
        .setTitle(`📅 날짜 수정 - 안건 #${topicId}`);
    
    const dateInput = new TextInputBuilder()
        .setCustomId('new_date')
        .setLabel('새 날짜 (YYYY-MM-DD 형식)')
        .setPlaceholder('예: 2024-12-31')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(dateInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 날짜 수정 모달 처리
 */
export async function handleEditDateModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const newDate = interaction.fields.getTextInputValue('new_date');
    
    // 날짜 형식 검증
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDate)) {
        await interaction.editReply({
            content: '❌ 올바른 날짜 형식이 아닙니다. YYYY-MM-DD 형식으로 입력해주세요.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    const topic = getTopic(topicId);
    if (!topic) {
        await interaction.editReply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        // 메시지 업데이트
        await updateTopicMessage(interaction.guild, topic, { date: newDate });
        
        // 성공 메시지
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 날짜 수정 완료')
            .setDescription(`안건 #${topicId}의 날짜가 수정되었습니다.`)
            .addFields({
                name: '새 날짜',
                value: newDate,
                inline: false
            })
            .setTimestamp();
        
        await interaction.editReply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('날짜 수정 중 오류:', error);
        await interaction.editReply({
            content: `❌ 날짜 수정 중 오류가 발생했습니다: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 뒤로가기 버튼 처리
 */
export async function handleEditBack(interaction) {
    await interaction.deferUpdate();
    
    // 활성 안건 다시 가져오기
    const allTopics = getTopics(interaction.guildId, '전체');
    const activeTopics = allTopics.filter(t => 
        t.status === '진행중' || t.status === '대기중' || t.status === '검토중'
    );
    
    await showEditMenu(interaction, activeTopics);
}

/**
 * 취소 버튼 처리
 */
export async function handleEditCancel(interaction) {
    // 세션 정리
    const sessionKey = `${interaction.guildId}:${interaction.user.id}`;
    editSessions.delete(sessionKey);
    
    await interaction.update({
        content: '❌ 수정이 취소되었습니다.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
}