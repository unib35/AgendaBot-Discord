import { MessageFlags } from 'discord.js';
import { 
    updateReminderSchedule, 
    markReminderDelivered,
    calculateSnoozeTime 
} from '../services/reminderService.js';

/**
 * Snooze 버튼 처리
 */
export async function handleReminderSnooze(interaction) {
    if (!interaction.customId.startsWith('reminder_snooze_')) return;
    
    const parts = interaction.customId.split('_');
    const snoozeType = parts[2]; // 1h, tomorrow, friday
    const reminderId = parseInt(parts[3]);
    
    if (!reminderId) {
        await interaction.reply({
            content: '❌ 잘못된 리마인더 ID입니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        const newTime = calculateSnoozeTime(snoozeType);
        if (!newTime) {
            await interaction.reply({
                content: '❌ 잘못된 스누즈 타입입니다.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        const success = await updateReminderSchedule(reminderId, newTime);
        
        if (success) {
            const snoozeDate = new Date(newTime);
            let message = '✅ 리마인더가 다시 예약되었습니다: ';
            
            switch(snoozeType) {
                case '1h':
                    message += '1시간 후';
                    break;
                case 'tomorrow':
                    message += '내일 오전 9시';
                    break;
                case 'friday':
                    message += '금요일 오전 9시';
                    break;
            }
            
            message += `\n(${snoozeDate.toLocaleString('ko-KR')})`;
            
            await interaction.update({
                content: interaction.message.content + '\n\n' + message,
                embeds: interaction.message.embeds,
                components: [] // 버튼 제거
            });
        } else {
            await interaction.reply({
                content: '❌ 리마인더 업데이트에 실패했습니다.',
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        console.error('Snooze 처리 중 오류:', error);
        await interaction.reply({
            content: '❌ 리마인더 처리 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 리마인더 확인 (Dismiss) 버튼 처리
 */
export async function handleReminderDismiss(interaction) {
    if (!interaction.customId.startsWith('reminder_dismiss_')) return;
    
    const reminderId = parseInt(interaction.customId.replace('reminder_dismiss_', ''));
    
    if (!reminderId) {
        await interaction.reply({
            content: '❌ 잘못된 리마인더 ID입니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        const success = await markReminderDelivered(reminderId);
        
        if (success) {
            await interaction.update({
                content: interaction.message.content + '\n\n✅ 리마인더를 확인했습니다.',
                embeds: interaction.message.embeds,
                components: [] // 버튼 제거
            });
        } else {
            await interaction.reply({
                content: '❌ 리마인더 확인 처리에 실패했습니다.',
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (error) {
        console.error('Dismiss 처리 중 오류:', error);
        await interaction.reply({
            content: '❌ 리마인더 처리 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
    }
}