import { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder,
    MessageFlags,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { 
    validateDate, 
    parseNaturalDate, 
    checkWeekendAndSuggestBusinessDay,
    formatDateKorean
} from '../utils/dateHelper.js';

// 임시 저장소 (userId -> 선택된 날짜)
const pendingDates = new Map();

/**
 * 날짜 선택 저장
 */
export function setPendingDate(userId, date) {
    pendingDates.set(userId, date);
}

/**
 * 날짜 선택 가져오기
 */
export function getPendingDate(userId) {
    return pendingDates.get(userId);
}

/**
 * 날짜 선택 삭제
 */
export function clearPendingDate(userId) {
    pendingDates.delete(userId);
}

/**
 * 날짜 직접 입력 모달 생성
 */
export function createDateInputModal(interactionId) {
    const modal = new ModalBuilder()
        .setCustomId(`date_input_modal:${interactionId}`)
        .setTitle('📅 마감일 직접 입력');
    
    const dateInput = new TextInputBuilder()
        .setCustomId('date_input')
        .setLabel('날짜 입력')
        .setPlaceholder('YYYY-MM-DD 또는 자연어 (예: 내일, +7일, 12/25)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(20);
    
    const hintText = new TextInputBuilder()
        .setCustomId('date_hint')
        .setLabel('💡 입력 예시')
        .setValue('• 2025-01-15\n• 내일\n• 다음주\n• +10일\n• 1/20')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(dateInput),
        new ActionRowBuilder().addComponents(hintText)
    );
    
    return modal;
}

/**
 * 날짜 셀렉트 메뉴 처리
 */
export async function handleDateSelect(interaction) {
    const selected = interaction.values[0];
    
    if (selected === 'custom') {
        // 직접 입력 모달 표시
        const modal = createDateInputModal(interaction.user.id);
        await interaction.showModal(modal);
        return;
    }
    
    // 주말 체크
    const weekendCheck = checkWeekendAndSuggestBusinessDay(selected);
    
    if (weekendCheck.isWeekend) {
        // 주말인 경우 영업일 제안
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚠️ 주말이 선택되었습니다')
            .setDescription(`선택한 날짜: **${weekendCheck.originalFormatted}**`)
            .addFields({
                name: '💼 다음 영업일 추천',
                value: `${weekendCheck.suggestedFormatted}로 변경하시겠습니까?`,
                inline: false
            });
        
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`date_confirm:${weekendCheck.suggested}`)
                .setLabel('영업일로 변경')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✅'),
            
            new ButtonBuilder()
                .setCustomId(`date_confirm:${weekendCheck.original}`)
                .setLabel('주말 유지')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📅')
        );
        
        await interaction.update({
            embeds: [embed],
            components: [buttons],
            flags: MessageFlags.Ephemeral
        });
    } else {
        // 평일 선택 - 바로 저장
        setPendingDate(interaction.user.id, selected);
        
        // 3단계로 이동 버튼
        const proceedButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`add_final_${interaction.user.id}`)
                .setLabel('3단계: 상세 정보 입력')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝')
        );
        
        await interaction.update({
            content: `✅ 마감일이 **${formatDateKorean(new Date(selected))}**로 설정되었습니다.\n\n다음 버튼을 클릭하여 안건 상세 정보를 입력해주세요.`,
            embeds: [],
            components: [proceedButton],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 빠른 날짜 버튼 처리
 */
export async function handleQuickDateButton(interaction) {
    const [action, date] = interaction.customId.split(':');
    
    if (action === 'date_quick') {
        // 빠른 선택 처리
        setPendingDate(interaction.user.id, date);
        
        // 3단계로 이동 버튼
        const proceedButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`add_final_${interaction.user.id}`)
                .setLabel('3단계: 상세 정보 입력')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝')
        );
        
        await interaction.update({
            content: `✅ 마감일이 **${formatDateKorean(new Date(date))}**로 설정되었습니다.\n\n다음 버튼을 클릭하여 안건 상세 정보를 입력해주세요.`,
            embeds: [],
            components: [proceedButton],
            flags: MessageFlags.Ephemeral
        });
    } else if (action === 'date_confirm') {
        // 주말/영업일 확인 처리
        setPendingDate(interaction.user.id, date);
        
        // 3단계로 이동 버튼
        const proceedButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`add_final_${interaction.user.id}`)
                .setLabel('3단계: 상세 정보 입력')
                .setStyle(ButtonStyle.Success)
                .setEmoji('📝')
        );
        
        await interaction.update({
            content: `✅ 마감일이 **${formatDateKorean(new Date(date))}**로 설정되었습니다.\n\n다음 버튼을 클릭하여 안건 상세 정보를 입력해주세요.`,
            embeds: [],
            components: [proceedButton],
            flags: MessageFlags.Ephemeral
        });
    } else if (interaction.customId === 'date_custom') {
        // 직접 입력 모달 표시
        const modal = createDateInputModal(interaction.user.id);
        await interaction.showModal(modal);
    }
}

/**
 * 날짜 입력 모달 처리
 */
export async function handleDateInputModal(interaction) {
    const input = interaction.fields.getTextInputValue('date_input');
    
    // 자연어 파싱 시도
    let parsedDate = parseNaturalDate(input);
    
    if (!parsedDate) {
        // 파싱 실패 - 그대로 검증
        parsedDate = input;
    }
    
    // 날짜 유효성 검증
    const validation = validateDate(parsedDate);
    
    if (!validation.valid) {
        await interaction.reply({
            content: `❌ ${validation.error}\n올바른 형식: YYYY-MM-DD (예: 2025-01-15)`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 경고가 있는 경우 (과거 날짜)
    if (validation.warning) {
        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚠️ 경고')
            .setDescription(validation.warning)
            .addFields({
                name: '선택한 날짜',
                value: formatDateKorean(new Date(validation.date)),
                inline: false
            });
        
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`date_confirm:${validation.date}`)
                .setLabel('계속 진행')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✅'),
            
            new ButtonBuilder()
                .setCustomId('date_cancel')
                .setLabel('다시 선택')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔄')
        );
        
        await interaction.reply({
            embeds: [embed],
            components: [buttons],
            flags: MessageFlags.Ephemeral
        });
    } else {
        // 주말 체크
        const weekendCheck = checkWeekendAndSuggestBusinessDay(validation.date);
        
        if (weekendCheck.isWeekend) {
            const embed = new EmbedBuilder()
                .setColor(0xFFA500)
                .setTitle('⚠️ 주말이 선택되었습니다')
                .setDescription(`선택한 날짜: **${weekendCheck.originalFormatted}**`)
                .addFields({
                    name: '💼 다음 영업일 추천',
                    value: `${weekendCheck.suggestedFormatted}로 변경하시겠습니까?`,
                    inline: false
                });
            
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`date_confirm:${weekendCheck.suggested}`)
                    .setLabel('영업일로 변경')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✅'),
                
                new ButtonBuilder()
                    .setCustomId(`date_confirm:${weekendCheck.original}`)
                    .setLabel('주말 유지')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📅')
            );
            
            await interaction.reply({
                embeds: [embed],
                components: [buttons],
                flags: MessageFlags.Ephemeral
            });
        } else {
            // 정상 날짜 - 저장
            setPendingDate(interaction.user.id, validation.date);
            
            // 3단계로 이동 버튼
            const proceedButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`add_final_${interaction.user.id}`)
                    .setLabel('3단계: 상세 정보 입력')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('📝')
            );
            
            await interaction.reply({
                content: `✅ 마감일이 **${formatDateKorean(new Date(validation.date))}**로 설정되었습니다.\n\n다음 버튼을 클릭하여 안건 상세 정보를 입력해주세요.`,
                components: [proceedButton],
                flags: MessageFlags.Ephemeral
            });
        }
    }
}