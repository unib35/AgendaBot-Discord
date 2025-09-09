import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { getTopic } from '../db/database.js';
import { sanitizeMarkdown } from '../utils/formatter.js';

/**
 * 안건 선택 후 체크리스트 입력 모달 표시
 */
export async function handleAddcheckAgendaSelect(interaction) {
    if (interaction.customId !== 'addcheck_agenda_select') return;
    
    const topicId = parseInt(interaction.values[0]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.update({
            content: '❌ 안건을 찾을 수 없습니다.',
            embeds: [],
            components: [],
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 체크리스트 입력 모달 생성
    const modal = new ModalBuilder()
        .setCustomId(`addcheck_modal:${topicId}`)
        .setTitle(`체크리스트 추가 - 안건 #${topicId}`);
    
    const checklistInput = new TextInputBuilder()
        .setCustomId('checklist_items')
        .setLabel('체크리스트 항목')
        .setPlaceholder('한 줄에 하나씩 입력하세요\n예: 디자인 검토\n     개발 완료\n     테스트 진행')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1000);
    
    modal.addComponents(
        new ActionRowBuilder().addComponents(checklistInput)
    );
    
    await interaction.showModal(modal);
}

/**
 * 체크리스트 모달 제출 처리
 */
export async function handleAddcheckModal(interaction) {
    if (!interaction.customId.startsWith('addcheck_modal:')) return;
    
    const topicId = parseInt(interaction.customId.split(':')[1]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 먼저 응답
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
        // 입력받은 체크리스트 항목들
        const checklistInput = interaction.fields.getTextInputValue('checklist_items');
        const newItems = checklistInput
            .split('\n')
            .map(item => item.trim())
            .filter(item => item.length > 0);
        
        if (newItems.length === 0) {
            await interaction.editReply({
                content: '⚠️ 추가할 체크리스트 항목이 없습니다.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // 원본 메시지 가져오기
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        if (!channel || !channel.isTextBased()) {
            await interaction.editReply({
                content: '❌ 안건 채널을 찾을 수 없습니다.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        const message = await channel.messages.fetch(topic.message_id).catch(() => null);
        if (!message) {
            await interaction.editReply({
                content: '❌ 안건 메시지를 찾을 수 없습니다.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        let content = message.content;
        const lines = content.split('\n');
        let checklistIndex = -1;
        let insertIndex = lines.length;
        
        // 체크리스트 섹션 찾기
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('### 체크리스트')) {
                checklistIndex = i;
                // 다음 섹션 찾기
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].startsWith('#') && !lines[j].startsWith('###')) {
                        insertIndex = j;
                        break;
                    }
                }
                if (insertIndex === lines.length) {
                    insertIndex = lines.length;
                }
                break;
            }
        }
        
        // 체크리스트 섹션이 없으면 생성
        if (checklistIndex === -1) {
            // 링크 섹션 앞에 추가
            let linkIndex = lines.findIndex(line => line.includes('### 링크'));
            if (linkIndex === -1) {
                linkIndex = lines.length;
            }
            
            lines.splice(linkIndex, 0, '', '### 체크리스트');
            checklistIndex = linkIndex + 1;
            insertIndex = linkIndex + 2;
        }
        
        // 새 체크리스트 항목들 추가
        const newChecklistLines = newItems.map(item => `- ⬜ ${item}`);
        
        // 기존 항목 뒤에 추가 (빈 줄 제거)
        let actualInsertIndex = insertIndex;
        // 체크리스트 섹션의 마지막 항목 찾기
        for (let i = checklistIndex + 1; i < insertIndex; i++) {
            if (lines[i].includes('⬜') || lines[i].includes('☑️')) {
                actualInsertIndex = i + 1;
            }
        }
        
        lines.splice(actualInsertIndex, 0, ...newChecklistLines);
        
        // 메시지 업데이트
        content = lines.join('\n');
        await message.edit({ content });
        
        // 스레드에 알림 메시지
        if (topic.thread_id) {
            const thread = await interaction.guild.channels.fetch(topic.thread_id).catch(() => null);
            if (thread && thread.isThread()) {
                await thread.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x00FF00)
                            .setTitle('✅ 체크리스트 추가됨')
                            .setDescription(`${newItems.length}개의 항목이 추가되었습니다.`)
                            .addFields({
                                name: '추가된 항목',
                                value: newItems.map((item, i) => `${i + 1}. ${item}`).join('\n').substring(0, 1024),
                                inline: false
                            })
                            .addFields({
                                name: '추가한 사람',
                                value: `<@${interaction.user.id}>`,
                                inline: true
                            })
                            .setTimestamp()
                    ]
                });
            }
        }
        
        // 성공 응답
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 체크리스트 추가 완료')
            .setDescription(`안건 #${topicId}에 체크리스트가 추가되었습니다.`)
            .addFields(
                { name: '안건', value: sanitizeMarkdown(topic.title), inline: false },
                { name: '추가된 항목 수', value: `${newItems.length}개`, inline: true }
            );
        
        // 추가된 항목 미리보기
        const preview = newItems.slice(0, 5).map((item, i) => `${i + 1}. ${item}`).join('\n');
        if (newItems.length > 5) {
            successEmbed.addFields({
                name: '추가된 항목',
                value: preview + `\n... 외 ${newItems.length - 5}개`,
                inline: false
            });
        } else {
            successEmbed.addFields({
                name: '추가된 항목',
                value: preview,
                inline: false
            });
        }
        
        await interaction.editReply({
            embeds: [successEmbed],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('체크리스트 추가 중 오류:', error);
        await interaction.editReply({
            content: '❌ 체크리스트 추가 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
    }
}