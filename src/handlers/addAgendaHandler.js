import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
    UserSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} from 'discord.js';
import { createDateSelectMenu, createQuickDateButtons } from '../utils/dateHelper.js';
import { getPendingDate, clearPendingDate } from '../handlers/dateHandler.js';

// 임시로 선택된 담당자를 저장하는 Map
const pendingAssignees = new Map();
// 안건 등록 플로우 상태 관리
const registrationFlow = new Map();

// 안건 등록 시작 버튼 핸들러
export async function handleAddStart(interaction) {
    if (!interaction.customId.startsWith('add_start_')) return;
    
    const userId = interaction.customId.replace('add_start_', '');
    if (userId !== interaction.user.id) return;
    
    // 1단계: 담당자 선택
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('👥 1단계: 담당자 선택')
        .setDescription('안건 담당자를 선택해주세요.\n담당자를 지정하지 않으려면 건너뛰기를 클릭하세요.');
    
    const userSelectRow = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
            .setCustomId(`add_assignees_${interaction.user.id}`)
            .setPlaceholder('담당자를 선택하세요 (최대 5명)')
            .setMinValues(0)
            .setMaxValues(5)
    );
    
    const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`add_skip_assignees_${interaction.user.id}`)
            .setLabel('건너뛰기')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏩'),
        new ButtonBuilder()
            .setCustomId(`add_to_date_${interaction.user.id}`)
            .setLabel('다음 단계')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➡️')
            .setDisabled(true) // 처음에는 비활성화
    );
    
    registrationFlow.set(interaction.user.id, { step: 1 });
    
    await interaction.update({
        embeds: [embed],
        components: [userSelectRow, buttonRow],
        flags: MessageFlags.Ephemeral
    });
}

export async function handleUserSelect(interaction) {
    if (!interaction.customId.startsWith('add_assignees_')) return;
    
    const userId = interaction.customId.replace('add_assignees_', '');
    if (userId !== interaction.user.id) return;
    
    // 선택한 유저 ID들을 저장
    pendingAssignees.set(interaction.user.id, interaction.values);
    
    const selectedText = interaction.values.length > 0 
        ? `✅ ${interaction.values.length}명의 담당자가 선택되었습니다: ${interaction.values.map(id => `<@${id}>`).join(', ')}`
        : '👤 담당자를 선택하지 않았습니다.';
    
    // 다음 버튼 활성화
    const components = interaction.message.components;
    components[1].components[1].data.disabled = false;
    
    const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setDescription(selectedText);
    
    await interaction.update({
        embeds: [embed],
        components: components,
        flags: MessageFlags.Ephemeral
    });
}

// 담당자 건너뛰기
export async function handleSkipAssignees(interaction) {
    if (!interaction.customId.startsWith('add_skip_assignees_')) return;
    
    const userId = interaction.customId.replace('add_skip_assignees_', '');
    if (userId !== interaction.user.id) return;
    
    pendingAssignees.set(interaction.user.id, []);
    
    // 2단계로 이동
    await showDateSelection(interaction);
}

// 2단계: 날짜 선택로 이동
export async function handleToDate(interaction) {
    if (!interaction.customId.startsWith('add_to_date_')) return;
    
    const userId = interaction.customId.replace('add_to_date_', '');
    if (userId !== interaction.user.id) return;
    
    await showDateSelection(interaction);
}

// 날짜 선택 화면 표시
async function showDateSelection(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📅 2단계: 마감일 선택')
        .setDescription('안건의 마감일을 선택해주세요.');
    
    // 빠른 선택 버튼
    const quickButtons = createQuickDateButtons();
    
    // 날짜 셀렉트 메뉴 (다음 30일)
    const dateSelect = createDateSelectMenu(`add_date_select_${interaction.user.id}`);
    const selectRow = new ActionRowBuilder().addComponents(dateSelect);
    
    registrationFlow.get(interaction.user.id).step = 2;
    
    await interaction.update({
        embeds: [embed],
        components: [quickButtons, selectRow],
        flags: MessageFlags.Ephemeral
    });
}

// 3단계: 상세 정보 입력 (모달 열기)
export async function handleAddFinal(interaction) {
    if (!interaction.customId.startsWith('add_final_')) return;
    
    const userId = interaction.customId.replace('add_final_', '');
    if (userId !== interaction.user.id) return;
    
    // 저장된 담당자 ID들을 가져옴
    const assigneeIds = pendingAssignees.get(interaction.user.id) || [];
    const selectedDate = getPendingDate(interaction.user.id);
    
    // 모달 생성 (customId에 담당자 ID 인코딩)
    const modal = new ModalBuilder()
        .setCustomId(`addAgendaModal:${assigneeIds.join(',')}`)
        .setTitle('📝 3단계: 안건 상세 정보');
    
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
    
    // 마감일은 이미 선택되었으므로 자동으로 채워짐
    const deadlineInput = new TextInputBuilder()
        .setCustomId('agendaDeadline')
        .setLabel('마감일 (수정 가능)')
        .setStyle(TextInputStyle.Short)
        .setValue(selectedDate || '') // 선택된 날짜 자동 입력
        .setRequired(false)
        .setMaxLength(20);
    
    // 추가 메모 필드
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

// 기존 handleAddNext는 더 이상 사용하지 않음 (deprecated)
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
    
    // 마감일은 이미 선택되었으므로 자동으로 채워짐
    const selectedDate = getPendingDate(interaction.user.id);
    const deadlineInput = new TextInputBuilder()
        .setCustomId('agendaDeadline')
        .setLabel('마감일')
        .setStyle(TextInputStyle.Short)
        .setValue(selectedDate || '') // 선택된 날짜 자동 입력
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