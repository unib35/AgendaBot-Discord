import {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} from 'discord.js';
import { getTopic, updateTopicStatus } from '../db/database.js';
import { formatAgendaTitle, sanitizeMarkdown } from '../utils/formatter.js';

/**
 * done select 메뉴 처리
 */
export async function handleDoneSelect(interaction) {
    if (interaction.customId !== 'done_select') return;
    
    const topicId = parseInt(interaction.values[0]);
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    // 확인 Embed 생성
    const confirmEmbed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⚠️ 안건 완료 확인')
        .setDescription(`다음 안건을 완료 처리하시겠습니까?`)
        .addFields(
            { name: '안건 번호', value: `#${topic.id}`, inline: true },
            { name: '제목', value: sanitizeMarkdown(topic.title), inline: true },
            { name: '현재 상태', value: topic.status, inline: true }
        )
        .setFooter({ text: '완료 처리하면 스레드도 함께 아카이브됩니다.' });
    
    // 확인/취소 버튼
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`done_confirm:${topicId}`)
            .setLabel('완료 처리')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        
        new ButtonBuilder()
            .setCustomId('done_cancel')
            .setLabel('취소')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
    );
    
    await interaction.update({
        embeds: [confirmEmbed],
        components: [buttons],
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 완료 확인 버튼 처리
 */
export async function handleDoneConfirm(interaction) {
    if (!interaction.customId.startsWith('done_confirm:')) return;
    
    const topicId = parseInt(interaction.customId.replace('done_confirm:', ''));
    
    // 먼저 interaction 응답 (defer 없이 바로 update)
    await interaction.update({
        content: '⏳ 안건을 완료 처리하는 중입니다...',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
    
    const topic = getTopic(topicId);
    
    if (!topic) {
        await interaction.editReply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    try {
        // 상태 업데이트
        updateTopicStatus(topicId, '완료');
        
        // 원본 메시지 업데이트
        const channel = await interaction.guild.channels.fetch(topic.channel_id);
        if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(topic.message_id).catch(() => null);
            
            if (message) {
                // 메시지 내용에서 상태 업데이트
                let content = message.content;
                content = content.replace(/\*\*상태\*\*\n.*/, '**상태**\n✅ 완료');
                
                await message.edit({ content });
                
                // 스레드 타이틀 업데이트
                if (topic.thread_id) {
                    const thread = await interaction.guild.channels.fetch(topic.thread_id).catch(() => null);
                    if (thread && thread.isThread()) {
                        const newTitle = formatAgendaTitle(topicId, topic.title, '완료');
                        await thread.setName(newTitle).catch(() => {});
                        
                        // 완료 메시지 스레드에 남기기
                        await thread.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(0x00FF00)
                                    .setTitle('✅ 안건 완료')
                                    .setDescription(`이 안건이 완료 처리되었습니다.`)
                                    .addFields(
                                        { name: '처리자', value: `<@${interaction.user.id}>`, inline: true },
                                        { name: '완료 시간', value: new Date().toLocaleString('ko-KR'), inline: true }
                                    )
                                    .setTimestamp()
                            ]
                        });
                        
                        // 스레드 아카이브
                        await thread.setArchived(true).catch(() => {});
                    }
                }
            }
        }
        
        // 성공 응답
        const successEmbed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('✅ 완료 처리 성공')
            .setDescription(`안건 #${topicId} "${sanitizeMarkdown(topic.title)}"이(가) 완료되었습니다.`)
            .setTimestamp();
        
        await interaction.editReply({
            content: null,
            embeds: [successEmbed],
            flags: MessageFlags.Ephemeral
        });
        
    } catch (error) {
        console.error('안건 완료 처리 중 오류:', error);
        await interaction.editReply({
            content: '❌ 안건 완료 처리 중 오류가 발생했습니다.',
            embeds: [],
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 취소 버튼 처리
 */
export async function handleDoneCancel(interaction) {
    if (interaction.customId !== 'done_cancel') return;
    
    await interaction.update({
        content: '❌ 완료 처리가 취소되었습니다.',
        embeds: [],
        components: [],
        flags: MessageFlags.Ephemeral
    });
}

// getChecklistProgress import 필요
function getChecklistProgress(content) {
    const lines = content.split('\n');
    let total = 0;
    let checked = 0;
    
    for (const line of lines) {
        if (line.includes('⬜')) total++;
        else if (line.includes('☑️')) {
            total++;
            checked++;
        }
    }
    
    if (total === 0) return null;
    
    const percentage = Math.round((checked / total) * 100);
    return {
        checked,
        total,
        percentage,
        display: `${checked}/${total} (${percentage}%)`
    };
}