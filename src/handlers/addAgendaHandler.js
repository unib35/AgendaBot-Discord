import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags
} from 'discord.js';

// 임시로 선택된 담당자를 저장하는 Map
const pendingAssignees = new Map();

export async function handleUserSelect(interaction) {
    if (!interaction.customId.startsWith('add_assignees_')) return;
    
    const userId = interaction.customId.replace('add_assignees_', '');
    if (userId !== interaction.user.id) return;
    
    // 선택한 유저 ID들을 저장
    pendingAssignees.set(interaction.user.id, interaction.values);
    
    const selectedText = interaction.values.length > 0 
        ? `선택된 담당자: ${interaction.values.map(id => `<@${id}>`).join(', ')}`
        : '담당자를 선택하지 않았습니다.';
    
    await interaction.update({
        content: `**📋 안건 등록 (1/2)**\n${selectedText}\n\n**다음** 버튼을 클릭하여 안건 정보를 입력하세요.`,
        components: interaction.message.components,
        flags: MessageFlags.Ephemeral
    });
}

export async function handleAddNext(interaction) {
    if (!interaction.customId.startsWith('add_next_')) return;
    
    const userId = interaction.customId.replace('add_next_', '');
    if (userId !== interaction.user.id) return;
    
    // 저장된 담당자 ID들을 가져옴
    const assigneeIds = pendingAssignees.get(interaction.user.id) || [];
    
    // 모달 생성 (customId에 담당자 ID 인코딩)
    const modal = new ModalBuilder()
        .setCustomId(`addAgendaModal:${assigneeIds.join(',')}`)
        .setTitle('📝 안건 등록 (2/2)');
    
    // 제목 입력 필드
    const titleInput = new TextInputBuilder()
        .setCustomId('agendaTitle')
        .setLabel('안건 제목')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 2024년 1분기 기획 회의')
        .setRequired(true)
        .setMaxLength(100);
    
    // 배경 입력 필드
    const backgroundInput = new TextInputBuilder()
        .setCustomId('agendaBackground')
        .setLabel('배경')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('이 안건을 제안하게 된 배경을 설명해주세요')
        .setRequired(true)
        .setMaxLength(500);
    
    // 목표 입력 필드
    const goalInput = new TextInputBuilder()
        .setCustomId('agendaGoal')
        .setLabel('목표')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('이 안건을 통해 달성하고자 하는 목표를 작성해주세요')
        .setRequired(true)
        .setMaxLength(500);
    
    // 마감일 입력 필드
    const deadlineInput = new TextInputBuilder()
        .setCustomId('agendaDeadline')
        .setLabel('마감일 (YYYY-MM-DD)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('예: 2024-12-31')
        .setRequired(false)
        .setMaxLength(20);
    
    // 추가 메모 필드 (담당자 대신)
    const notesInput = new TextInputBuilder()
        .setCustomId('agendaNotes')
        .setLabel('추가 메모 (선택사항)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('추가로 기록할 내용이 있다면 작성해주세요')
        .setRequired(false)
        .setMaxLength(300);
    
    // Action Rows에 입력 필드 추가
    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(backgroundInput),
        new ActionRowBuilder().addComponents(goalInput),
        new ActionRowBuilder().addComponents(deadlineInput),
        new ActionRowBuilder().addComponents(notesInput)
    );
    
    await interaction.showModal(modal);
}

export function getPendingAssignees(userId) {
    return pendingAssignees.get(userId) || [];
}

export function clearPendingAssignees(userId) {
    pendingAssignees.delete(userId);
}