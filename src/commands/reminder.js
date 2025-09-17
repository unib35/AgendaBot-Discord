import { 
    SlashCommandBuilder, 
    MessageFlags
} from 'discord.js';
import { ensurePermissions } from '../utils/guards.js';
import { showReminderDashboard } from '../handlers/reminderInteractionHandler.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reminder')
        .setDescription('🔔 리마인더 관리 - 인터랙티브 대시보드로 리마인더 관리'),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        // 인터랙티브 대시보드 표시
        await showReminderDashboard(interaction, true);
    },
};