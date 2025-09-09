import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { ensurePermissions } from '../utils/guards.js';
import { getGuildSettings } from '../db/database.js';
import { parseCronExpression } from '../utils/schedule.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('봇 사용법과 명령어 목록을 확인합니다'),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        // 현재 서버 설정 확인
        const guildSettings = getGuildSettings(interaction.guildId);
        const hasSetup = guildSettings?.tracking_channel_id ? true : false;
        
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📖 AgendaBot 사용 가이드')
            .setDescription('회의 안건을 효율적으로 관리하는 디스코드 봇입니다.\n\n**🆕 주요 기능**: AI 요약, 통계 분석, 실제 멘션 지원, 버튼 인터랙션')
            .addFields(
                {
                    name: '📝 안건 관리',
                    value: 
`**\`/add\`** - 새 안건 등록 (2단계 입력)
  • 1단계: 담당자 선택 (UserSelectMenu)
  • 2단계: 제목, 배경, 목표, 마감일, 메모 입력
  • 담당자에게 실제 Discord 알림 전송
**\`/done id:\`** - 안건 완료 처리
**\`/status id: status:\`** - 안건 상태 변경
  • 진행중/완료/보류/취소/검토중/대기중
**\`/link id: url:\`** - 회의록 링크 추가`,
                    inline: false
                },
                {
                    name: '✅ 체크리스트 관리',
                    value:
`**\`/check id: item:\`** - 특정 체크박스 토글
**\`/checkall id: action:\`** - 모든 체크박스 일괄 처리
  • \`action:모두 완료\` - 전체 완료
  • \`action:모두 해제\` - 전체 해제
**\`/addcheck id: item:\`** - 체크리스트 항목 추가
**진행률 자동 표시** - 체크리스트 위에 \`2/4 (50%)\``,
                    inline: false
                },
                {
                    name: '🔍 조회 및 검색',
                    value:
`**\`/list [status:] [owner:]\`** - 안건 목록 조회
  • \`status:\` - 상태별 필터링
  • \`owner:\` - 담당자별 필터링
**\`/search keyword:\`** - 키워드로 안건 검색`,
                    inline: false
                },
                {
                    name: '📊 통계 및 AI 요약',
                    value:
`**\`/stats [range:] [filter:]\`** - 안건 통계 조회
  • \`range:\` 기간 선택 (오늘/이번주/이번달/전체)
  • \`filter:\` 상태별 필터링
**\`/summary [range:] [preview:]\`** - AI 요약 생성
  • \`range:\` 요약 기간 (이번주/지난주/이번달)
  • \`preview:\` 미리보기 여부
**\`/testsummary [post:]\`** - AI 설정 테스트
  • \`post:\` 실제 게시 여부`,
                    inline: false
                },
                {
                    name: '⚙️ 설정 및 유틸리티',
                    value:
`**\`/setup\`** - 봇 설정 구성 (관리자 전용)
  • \`tracking_channel:\` 안건 출력 채널
  • \`command_channel:\` 명령어 제한 채널
  • \`allowed_role:\` 권한 역할 제한
  • \`summary_channel:\` AI 요약 채널
  • \`weekly_enabled:\` 자동 요약 활성화
  • \`summary_day:\` 요약 실행 요일 (월~일)
  • \`summary_time:\` 요약 실행 시간 (09:00)
  • \`model:\` Gemini 모델 선택
**\`/setupkey\`** - Gemini API 키 설정 (관리자 전용)
**\`/help\`** - 이 도움말 표시
**\`/ping\`** - 봇 상태 확인`,
                    inline: false
                },
                {
                    name: '🎯 버튼 인터랙션',
                    value:
`안건 카드 하단에 표시되는 버튼들:
**✅ 완료** - 안건을 즉시 완료 처리
**🔄 상태 변경** - 드롭다운으로 상태 선택
**➕ 체크리스트 추가** - 모달로 새 항목 추가`,
                    inline: false
                },
                {
                    name: '💡 사용 예시',
                    value:
`**안건 등록:** \`/add\` → 담당자 선택 → 정보 입력
**상태 변경:** \`/status id:1 status:보류\`
**일괄 완료:** \`/checkall id:1 action:모두 완료\`
**검색:** \`/search keyword:로그인\`
**필터링:** \`/list status:진행중 owner:@홍길동\`
**항목 추가:** \`/addcheck id:1 item:디자인 검토\`
**상태 확인:** \`/ping\` → WS Ping, RTT, Uptime
**스케줄 설정:** \`/setup summary_day:월요일 summary_time:09:00\``,
                    inline: false
                },
                {
                    name: '📋 상태 종류',
                    value:
`🧭 **진행중** - 작업이 진행 중인 안건
✅ **완료** - 완료된 안건
⏸️ **보류** - 일시적으로 중단된 안건
❌ **취소** - 취소된 안건
🔄 **검토중** - 검토가 필요한 안건
⏳ **대기중** - 대기 중인 안건`,
                    inline: false
                },
                {
                    name: hasSetup ? '✅ 현재 서버 설정' : '⚠️ 초기 설정 필요',
                    value: hasSetup 
                        ? `• 출력 채널: <#${guildSettings.tracking_channel_id}>
• 명령 채널: ${guildSettings.command_channel_id ? `<#${guildSettings.command_channel_id}>` : '모든 채널'}
• 권한 역할: ${guildSettings.allowed_role_id ? `<@&${guildSettings.allowed_role_id}>` : '모든 사용자'}
• 요약 채널: ${guildSettings.summary_channel_id ? `<#${guildSettings.summary_channel_id}>` : '출력 채널 사용'}
• 자동 요약: ${guildSettings.weekly_summary_enabled ? '✅ 활성화' : '⏸ 비활성화'}
• 스케줄: ${parseCronExpression(guildSettings.weekly_summary_cron || '0 9 * * MON')}
• AI 모델: ${guildSettings.gemini_model || 'gemini-2.0-flash-exp'}
• API 키: ${guildSettings.ai_api_key_encrypted ? '✅ 설정됨' : '⚠️ 미설정'}`
                        : '`/setup` 명령어로 초기 설정을 완료해주세요.',
                    inline: false
                },
                {
                    name: '📌 주의사항',
                    value:
`• 안건 번호는 삭제해도 재사용되지 않습니다
• 체크박스는 \`⬜\` 이모지를 사용해야 인식됩니다
• 각 서버마다 독립적인 설정과 데이터를 가집니다
• 스레드 생성 시 자동으로 안내 댓글이 작성됩니다
• 담당자 선택 시 실제 Discord 알림이 전송됩니다`,
                    inline: false
                },
                {
                    name: '🚀 최신 업데이트',
                    value:
`• **AI 요약 기능**: Gemini API로 주간/월간 요약
• **통계 분석**: 기간별 안건 통계 조회
• **서버별 AI 설정**: 독립적인 API 키 관리
• **자동 주간 요약**: Cron 스케줄로 자동 생성
• **실제 멘션 지원**: UserSelectMenu로 담당자 선택
• **진행률 자동 표시**: 체크리스트 완료율`,
                    inline: false
                }
            )
            .setFooter({ text: 'AgendaBot v4.0 | AI 요약 지원' })
            .setTimestamp();
        
        await interaction.reply({ 
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    },
};