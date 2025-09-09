import { 
    SlashCommandBuilder, 
    MessageFlags,
    ActionRowBuilder,
    UserSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} from 'discord.js';
import { ensurePermissions } from '../utils/guards.js';

export default {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('새로운 회의 안건을 등록합니다'),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        // 유저 선택 메뉴 생성
        const userSelectRow = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`add_assignees_${interaction.user.id}`)
                .setPlaceholder('담당자를 선택하세요 (선택사항)')
                .setMinValues(0)
                .setMaxValues(5)
        );
        
        // 다음 버튼
        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`add_next_${interaction.user.id}`)
                .setLabel('다음 ➡️')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝')
        );
        
        await interaction.reply({
            content: '**📋 안건 등록 (1/2)**\n담당자를 선택한 후 **다음** 버튼을 클릭하세요.\n> 담당자를 지정하지 않으려면 바로 다음을 클릭하세요.',
            components: [userSelectRow, buttonRow],
            flags: MessageFlags.Ephemeral
        });
    },
};