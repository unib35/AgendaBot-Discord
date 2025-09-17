import { 
    SlashCommandBuilder, 
    MessageFlags,
    ActionRowBuilder,
    UserSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} from 'discord.js';
import { ensurePermissions } from '../utils/guards.js';
import { createDateSelectMenu, createQuickDateButtons } from '../utils/dateHelper.js';

export default {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('📝 새 안건 등록 - 대화형 메뉴로 단계별 안건 생성'),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        // 안건 등록 플로우 안내 Embed
        const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 새 안건 등록')
            .setDescription('안건 등록을 시작합니다. 단계별로 진행해주세요.')
            .addFields(
                { name: '👥 1단계', value: '담당자 선택', inline: true },
                { name: '🕐 2단계', value: '회의 일시 설정', inline: true },
                { name: '📝 3단계', value: '상세 정보 입력', inline: true },
                { name: '✅ 4단계', value: '체크리스트 추가 (선택)', inline: true }
            )
            .setFooter({ text: '시작하려면 아래 버튼을 클릭하세요' });
        
        // 시작 버튼
        const startButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`add_start_${interaction.user.id}`)
                .setLabel('안건 등록 시작')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🚀')
        );
        
        await interaction.reply({
            embeds: [embed],
            components: [startButton],
            flags: MessageFlags.Ephemeral
        });
    },
};