import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    MessageFlags
} from 'discord.js';
import { getTopic } from '../db/database.js';

// 임시 저장소 (userId -> {topicId, selectedIndexes})
const pendingSelections = new Map();

/**
 * 체크리스트 패널 생성
 */
export function createChecklistPanel(topicId, content) {
    const components = [];
    
    // 체크리스트 항목 파싱
    const checklistItems = parseChecklistItems(content);
    
    if (checklistItems.length === 0) {
        return null;
    }
    
    // 최대 25개까지만 (Discord 제한)
    const itemsToShow = checklistItems.slice(0, 25);
    
    // 멀티 셀렉트 메뉴
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`ck:select:${topicId}`)
        .setPlaceholder('✅ 체크/해제할 항목을 선택하세요')
        .setMinValues(0)
        .setMaxValues(Math.min(itemsToShow.length, 10))
        .addOptions(itemsToShow.map((item, index) => ({
            label: `${item.checked ? '✅' : '⬜'} ${item.text.substring(0, 80)}`,
            value: String(index),
            description: item.checked ? '완료됨' : '미완료',
            emoji: item.checked ? '✅' : '⬜'
        })));
    
    components.push(new ActionRowBuilder().addComponents(selectMenu));
    
    // 액션 버튼들
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ck:toggle:${topicId}`)
            .setLabel('선택 항목 토글')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄'),
        
        new ButtonBuilder()
            .setCustomId(`ck:all:${topicId}:on`)
            .setLabel('모두 완료')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        
        new ButtonBuilder()
            .setCustomId(`ck:all:${topicId}:off`)
            .setLabel('모두 해제')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬜'),
        
        new ButtonBuilder()
            .setCustomId(`ck:refresh:${topicId}`)
            .setLabel('새로고침')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
    );
    
    components.push(buttons);
    
    // 25개 이상인 경우 안내 메시지
    if (checklistItems.length > 25) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ck:info')
                .setLabel(`전체 ${checklistItems.length}개 중 25개 표시 중`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        ));
    }
    
    return components;
}

/**
 * 체크리스트 진행률 Embed 생성
 */
export function createProgressEmbed(content) {
    const checklistItems = parseChecklistItems(content);
    const completed = checklistItems.filter(item => item.checked).length;
    const total = checklistItems.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    // 진행률 바 생성
    const barLength = 20;
    const filledLength = Math.round((percentage / 100) * barLength);
    const progressBar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    
    const embed = new EmbedBuilder()
        .setColor(percentage === 100 ? 0x00FF00 : 0x5865F2)
        .setTitle('📊 체크리스트 진행률')
        .setDescription(`\`${progressBar}\` **${percentage}%**`)
        .addFields(
            { name: '완료', value: `${completed}개`, inline: true },
            { name: '전체', value: `${total}개`, inline: true },
            { name: '남은 항목', value: `${total - completed}개`, inline: true }
        )
        .setFooter({ text: '아래에서 항목을 선택하고 버튼을 눌러 상태를 변경하세요' });
    
    return embed;
}

/**
 * 체크리스트 항목 파싱
 */
function parseChecklistItems(content) {
    const lines = content.split('\n');
    const items = [];
    let inChecklist = false;

    console.log('=== parseChecklistItems 디버깅 시작 ===');
    console.log('전체 내용 길이:', content.length);
    console.log('전체 라인 수:', lines.length);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // 체크리스트 섹션 찾기 (공백 무시하고 체크)
        if (trimmedLine === '### 체크리스트' || line.includes('### 체크리스트')) {
            inChecklist = true;
            console.log(`라인 ${i}: 체크리스트 섹션 시작 - "${line}"`);
            continue;
        }

        if (inChecklist) {
            // 다른 헤더 섹션이 시작되면 체크리스트 섹션 종료
            if (trimmedLine.startsWith('#') && !trimmedLine.startsWith('###')) {
                console.log(`라인 ${i}: 다른 섹션 시작, 체크리스트 파싱 종료 - "${line}"`);
                break;
            }

            // "체크리스트 항목이 없습니다" 텍스트는 무시
            if (line.includes('체크리스트 항목이 없습니다')) {
                console.log(`라인 ${i}: "체크리스트 항목이 없습니다" 텍스트 무시`);
                continue;
            }

            // 빈 줄은 무시
            if (trimmedLine === '') {
                console.log(`라인 ${i}: 빈 줄 무시`);
                continue;
            }

            // 체크박스 아이템 찾기 (다양한 형식 지원)
            if (line.includes('⬜') || line.includes('☑️') || line.includes('✅')) {
                const checked = line.includes('☑️') || line.includes('✅');
                // 다양한 체크박스 패턴 처리
                const text = line
                    .replace(/^\s*[-*+]?\s*/, '')  // 리스트 마커 제거
                    .replace(/[⬜☑️✅]/g, '')        // 체크박스 이모지 제거
                    .trim();

                console.log(`라인 ${i}: 체크박스 발견 - checked: ${checked}, text: "${text}", 원본: "${line}"`);

                if (text) {
                    items.push({ checked, text });
                    console.log(`  -> 항목 추가됨 (총 ${items.length}개)`);
                } else {
                    console.log(`  -> 텍스트가 비어있어 무시됨`);
                }
            } else {
                console.log(`라인 ${i}: 체크박스 없음 - "${line}"`);
            }
        } else {
            // 체크리스트 섹션 찾는 중
            if (i < 10 || line.includes('체크')) {
                console.log(`라인 ${i}: (체크리스트 섹션 찾는 중) - "${line.substring(0, 50)}..."`);
            }
        }
    }

    console.log(`=== 파싱 완료: 총 ${items.length}개 항목 발견 ===`);
    if (items.length > 0) {
        console.log('발견된 항목들:', items);
    }
    return items;
}

/**
 * 셀렉트 메뉴 선택 처리
 */
export async function handleChecklistSelect(interaction) {
    if (!interaction.customId.startsWith('ck:select:')) return;
    
    const topicId = parseInt(interaction.customId.replace('ck:select:', ''));
    const selectedIndexes = interaction.values.map(v => parseInt(v));
    
    // 선택 항목 저장
    pendingSelections.set(interaction.user.id, {
        topicId,
        selectedIndexes
    });
    
    // 선택 확인 메시지
    await interaction.reply({
        content: `✅ ${selectedIndexes.length}개 항목이 선택되었습니다. 원하는 작업 버튼을 클릭하세요.`,
        flags: MessageFlags.Ephemeral
    });
}

/**
 * 버튼 클릭 처리
 */
export async function handleChecklistButton(interaction) {
    if (!interaction.customId.startsWith('ck:')) return;
    
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const topicId = parseInt(parts[2]);
    
    // 권한 확인 (작성자 또는 담당자만)
    const topic = getTopic(topicId);
    if (!topic) {
        await interaction.reply({
            content: '❌ 안건을 찾을 수 없습니다.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }
    
    await interaction.deferUpdate();

    try {
        // 스레드에서 실제 안건 메시지 찾기
        const thread = interaction.channel;
        if (!thread.isThread()) {
            await interaction.followUp({
                content: '❌ 스레드에서만 사용할 수 있습니다.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        console.log(`\n체크리스트 버튼 처리: action=${action}, topicId=${topicId}`);

        // 안건 메시지는 스레드가 아닌 채널에 있음
        // DB에서 topic 정보 가져와서 채널에서 메시지 가져오기
        let agendaMessage = null;

        try {
            // 채널에서 원본 안건 메시지 가져오기
            const channel = await thread.guild.channels.fetch(topic.channel_id);
            agendaMessage = await channel.messages.fetch(topic.message_id);
            console.log(`채널에서 안건 메시지 가져옴: ${agendaMessage.content.substring(0, 100)}...`);
        } catch (err) {
            console.error('채널에서 메시지 가져오기 실패:', err);

            // 폴백: 스레드 내에서 찾기
            const messages = await thread.messages.fetch({ limit: 100 });
            agendaMessage = messages.find(msg =>
                msg.content.includes(`# 안건 #${topicId}`) ||
                (msg.content.includes('### 체크리스트') &&
                 msg.author.id === interaction.client.user.id &&
                 (msg.content.includes('⬜') || msg.content.includes('☑️')))
            );
        }

        if (!agendaMessage) {
            console.log(`안건 #${topicId} 메시지를 찾을 수 없음`);
            await interaction.followUp({
                content: `❌ 안건 메시지를 찾을 수 없습니다. (안건 #${topicId})`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        console.log(`안건 메시지 처리 준비 완료`);

        let newContent = agendaMessage.content;
        
        switch (action) {
            case 'toggle': {
                // 선택된 항목 토글
                const selection = pendingSelections.get(interaction.user.id);
                if (!selection || selection.topicId !== topicId) {
                    await interaction.followUp({
                        content: '⚠️ 먼저 항목을 선택해주세요.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                newContent = toggleChecklistItems(newContent, selection.selectedIndexes);
                pendingSelections.delete(interaction.user.id);
                break;
            }
            
            case 'all': {
                // 전체 체크/해제
                const setChecked = parts[3] === 'on';
                newContent = setAllChecklistItems(newContent, setChecked);
                break;
            }
            
            case 'refresh': {
                // 패널 새로고침
                // 안건 메시지의 현재 내용으로 패널 업데이트
                console.log('체크리스트 패널 새로고침');
                await updateChecklistPanel(thread, topicId, agendaMessage.content);
                return; // 안건 메시지는 수정하지 않음
            }
            
            default:
                return;
        }
        
        // DB에는 별도로 저장하지 않음 (Discord 메시지가 source of truth)

        // 실제 안건 메시지 업데이트
        await agendaMessage.edit({
            content: newContent
        });

        // 체크리스트 패널 업데이트 (현재 패널 메시지)
        await updateChecklistPanel(thread, topicId, newContent);
        
    } catch (error) {
        console.error('체크리스트 버튼 처리 중 오류:', error);
        await interaction.followUp({
            content: '❌ 체크리스트 업데이트 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
    }
}

/**
 * 선택된 항목들 토글
 */
function toggleChecklistItems(content, indexes) {
    const lines = content.split('\n');
    let currentIndex = -1;
    let inChecklist = false;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('### 체크리스트')) {
            inChecklist = true;
            continue;
        }
        
        if (inChecklist) {
            if (lines[i].startsWith('#') && !lines[i].startsWith('###')) {
                break;
            }
            
            if (lines[i].includes('⬜') || lines[i].includes('☑️')) {
                currentIndex++;
                if (indexes.includes(currentIndex)) {
                    // 토글
                    if (lines[i].includes('⬜')) {
                        lines[i] = lines[i].replace('⬜', '☑️');
                    } else {
                        lines[i] = lines[i].replace('☑️', '⬜');
                    }
                }
            }
        }
    }
    
    return lines.join('\n');
}

/**
 * 모든 체크리스트 항목 설정
 */
function setAllChecklistItems(content, checked) {
    const lines = content.split('\n');
    let inChecklist = false;
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('### 체크리스트')) {
            inChecklist = true;
            continue;
        }
        
        if (inChecklist) {
            if (lines[i].startsWith('#') && !lines[i].startsWith('###')) {
                break;
            }
            
            if (lines[i].includes('⬜') || lines[i].includes('☑️')) {
                lines[i] = lines[i].replace(/[⬜☑️]/, checked ? '☑️' : '⬜');
            }
        }
    }
    
    return lines.join('\n');
}

/**
 * 스레드의 체크리스트 패널 업데이트
 */
async function updateChecklistPanel(thread, topicId, content) {
    try {
        // 최근 메시지 중 체크리스트 패널 찾기
        const messages = await thread.messages.fetch({ limit: 20 });
        const panelMessage = messages.find(msg =>
            msg.author.id === thread.client.user.id &&
            msg.embeds.length > 0 &&
            msg.embeds[0].title?.includes('체크리스트 진행률')
        );

        if (panelMessage) {
            console.log(`체크리스트 패널 업데이트: 안건 #${topicId}`);
            const newEmbed = createProgressEmbed(content);
            const newComponents = createChecklistPanel(topicId, content);

            if (!newComponents) {
                console.log('체크리스트 패널 컴포넌트 생성 실패');
                return;
            }

            await panelMessage.edit({
                embeds: [newEmbed],
                components: newComponents
            });
            console.log('체크리스트 패널 업데이트 완료');
        } else {
            console.log('체크리스트 패널 메시지를 찾을 수 없음');
        }
    } catch (error) {
        console.error('체크리스트 패널 업데이트 중 오류:', error);
    }
}

/**
 * 체크리스트 패널 메시지 생성 (스레드에 게시용)
 */
export async function postChecklistPanel(thread, topicId) {
    const topic = getTopic(topicId);
    if (!topic) {
        console.log(`Topic #${topicId} not found in database`);
        return;
    }

    // 원본 메시지 가져오기
    try {
        // 먼저 스레드의 시작 메시지(안건 내용)를 찾기
        const messages = await thread.messages.fetch({ limit: 20 });
        let content = null;

        // 방법 1: 스레드 시작 메시지에서 안건 찾기
        const firstMessage = messages.last();
        if (firstMessage && firstMessage.content.includes(`# 안건 #${topicId}`)) {
            content = firstMessage.content;
            console.log(`스레드 시작 메시지에서 안건 발견`);
        }

        // 방법 2: 메시지 중에서 안건 형식 찾기
        if (!content) {
            const agendaMessage = messages.find(msg =>
                msg.content.includes(`# 안건 #${topicId}`) ||
                msg.content.includes('### 체크리스트')
            );
            if (agendaMessage) {
                content = agendaMessage.content;
                console.log(`스레드 메시지 중에서 안건 발곬`);
            }
        }

        // 방법 3: DB에 저장된 메시지 ID로 가져오기 (폴백)
        if (!content) {
            const channel = await thread.guild.channels.fetch(topic.channel_id);
            const dbMessage = await channel.messages.fetch(topic.message_id).catch(() => null);
            if (dbMessage && dbMessage.content.includes('안건')) {
                content = dbMessage.content;
                console.log(`DB 메시지 ID로 안건 발견`);
            }
        }

        if (!content) {
            console.log('안건 메시지를 찾을 수 없음');
            return null;
        }

        // 디버깅: 체크리스트 내용 확인
        console.log(`\n=== 안건 #${topicId} 체크리스트 패널 생성 ===`);
        console.log(`메시지 ID: ${topic.message_id}`);
        console.log(`스레드 ID: ${thread.id}`);

        // 체크리스트 섹션 찾기
        const checklistIndex = content.indexOf('### 체크리스트');
        if (checklistIndex !== -1) {
            console.log(`체크리스트 섹션 위치: ${checklistIndex}`);
            const checklistSection = content.substring(checklistIndex, Math.min(checklistIndex + 500, content.length));
            console.log(`체크리스트 섹션 내용 (처음 500자):\n${checklistSection}`);
        } else {
            console.log('체크리스트 섹션을 찾을 수 없음');
        }

        // 체크리스트 항목 파싱 확인
        const checklistItems = parseChecklistItems(content);
        console.log(`파싱 결과: ${checklistItems.length}개 항목 발견`);
        if (checklistItems.length > 0) {
            console.log(`파싱된 항목들:`);
            checklistItems.forEach((item, idx) => {
                console.log(`  ${idx + 1}. [${item.checked ? '✓' : ' '}] ${item.text}`);
            });
        }

        const progressEmbed = createProgressEmbed(content);
        const panelComponents = createChecklistPanel(topicId, content);

        if (!panelComponents) {
            // 체크리스트가 없는 경우 패널을 생성하지 않고 조용히 종료
            console.log(`안건 #${topicId}에 체크리스트가 없어 패널을 생성하지 않음`);
            return;
        }
        
        const panelMessage = await thread.send({
            embeds: [progressEmbed],
            components: panelComponents
        });

        // 고정 제거: 사용자가 필요시 수동으로 고정 가능
        // 필요하면 나중에 설정으로 만들 수 있음
        // try {
        //     await panelMessage.pin();
        // } catch (error) {
        //     console.error('메시지 고정 실패:', error);
        // }
        
        return panelMessage;
    } catch (error) {
        console.error('체크리스트 패널 생성 중 오류:', error);
        await thread.send({
            content: '❌ 체크리스트 패널 생성 중 오류가 발생했습니다.',
            flags: MessageFlags.Ephemeral
        });
        return null;
    }
}