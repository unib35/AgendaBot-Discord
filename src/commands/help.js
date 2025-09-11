import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { ensurePermissions } from '../utils/guards.js';
import { getGuildSettings } from '../db/database.js';
import { parseCronExpression } from '../utils/schedule.js';

// 각 명령어별 상세 도움말
const commandHelp = {
    add: {
        title: '📝 /add - 새 안건 등록',
        description: '새로운 안건을 생성하는 명령어입니다. 대화형 메뉴를 통해 단계별로 안건을 만들 수 있습니다.',
        fields: [
            {
                name: '📋 사용 순서',
                value: `1️⃣ **담당자 선택** - 드롭다운에서 담당자를 선택합니다
2️⃣ **날짜 선택** - 빠른 선택 버튼 또는 사용자 지정 날짜를 선택합니다
3️⃣ **상세정보 입력** - 모달창에서 제목, 배경, 목표 등을 입력합니다
4️⃣ **체크리스트 추가** - 선택적으로 체크리스트 항목을 추가합니다`
            },
            {
                name: '💡 입력 필드 설명',
                value: `**제목** (필수) - 안건의 제목 (최대 100자)
**배경** (필수) - 안건이 필요한 이유와 맥락
**목표** (필수) - 달성하고자 하는 구체적인 목표
**마감일** (선택) - YYYY-MM-DD 형식 또는 자유 형식
**메모** (선택) - 추가 참고사항이나 링크`
            },
            {
                name: '✨ 주요 기능',
                value: `• 담당자에게 실제 Discord 알림 전송
• 자동으로 스레드 생성 및 컨트롤 패널 추가
• 체크리스트가 있으면 체크리스트 패널 자동 생성
• 진행률 바 자동 표시`
            },
            {
                name: '📌 사용 예시',
                value: `\`/add\` 입력 → 담당자 선택 → "이번 주" 버튼 클릭 → 정보 입력 → 체크리스트 추가`
            },
            {
                name: '💬 팁',
                value: `• 템플릿을 미리 만들어두면 더 빠르게 안건을 생성할 수 있습니다
• 담당자를 여러 명 선택하면 모두에게 알림이 갑니다
• 체크리스트는 나중에도 추가할 수 있습니다`
            }
        ]
    },
    done: {
        title: '✅ /done - 안건 완료',
        description: '진행중인 안건을 완료 상태로 변경하는 명령어입니다.',
        fields: [
            {
                name: '📋 사용 방법',
                value: `1️⃣ \`/done\` 명령어 입력
2️⃣ 드롭다운 메뉴에서 완료할 안건 선택
3️⃣ 확인 버튼 클릭으로 최종 완료`
            },
            {
                name: '✨ 자동 처리 사항',
                value: `• 안건 상태가 "완료"로 변경
• 스레드 제목에 [완료] 표시 추가
• 체크리스트가 있으면 모두 완료 처리
• 완료 시간 기록`
            },
            {
                name: '📌 주의사항',
                value: `• 이미 완료된 안건은 목록에 표시되지 않습니다
• 완료 처리는 되돌릴 수 없으니 신중하게 선택하세요
• 필요시 /status 명령어로 상태를 다시 변경할 수 있습니다`
            }
        ]
    },
    status: {
        title: '🔄 /status - 상태 변경',
        description: '안건의 상태를 변경하는 명령어입니다.',
        fields: [
            {
                name: '📋 사용 방법',
                value: `1️⃣ \`/status\` 명령어 입력
2️⃣ 드롭다운에서 변경할 안건 선택
3️⃣ 새로운 상태 선택`
            },
            {
                name: '📊 상태 종류',
                value: `🔄 **진행중** - 현재 작업 중인 안건
⏸️ **대기중** - 일시 중단된 안건
🔍 **검토중** - 검토가 필요한 안건
✅ **완료** - 완료된 안건
❌ **취소** - 취소된 안건`
            },
            {
                name: '✨ 자동 처리',
                value: `• 스레드 제목의 상태 태그 자동 업데이트
• 상태 변경 시간 기록
• 상태별 이모지 자동 적용`
            }
        ]
    },
    check: {
        title: '☑️ /check - 체크리스트 관리',
        description: '안건의 체크리스트 항목을 완료/해제하는 명령어입니다.',
        fields: [
            {
                name: '📋 사용 방법',
                value: `1️⃣ \`/check\` 명령어 입력
2️⃣ 안건 선택 (드롭다운)
3️⃣ 체크할 항목 선택 (드롭다운)
4️⃣ 완료/해제 버튼 클릭`
            },
            {
                name: '✨ 대체 방법',
                value: `• **체크리스트 패널** - 스레드에서 버튼으로 직접 관리
• **본문 클릭** - 체크박스를 직접 클릭해도 변경 가능`
            },
            {
                name: '📊 진행률',
                value: `• 체크리스트 위에 진행률 바 자동 표시
• 완료된 항목 수 / 전체 항목 수 (퍼센트)
• 실시간 업데이트`
            }
        ]
    },
    addcheck: {
        title: '➕ /addcheck - 체크리스트 추가',
        description: '기존 안건에 새로운 체크리스트 항목을 추가하는 명령어입니다.',
        fields: [
            {
                name: '📋 사용 방법',
                value: `1️⃣ \`/addcheck\` 명령어 입력
2️⃣ 드롭다운에서 안건 선택
3️⃣ 모달창에 추가할 항목 입력 (한 줄에 하나씩)`
            },
            {
                name: '💡 입력 예시',
                value: `\`\`\`
API 문서 작성
테스트 케이스 추가
코드 리뷰 요청
배포 준비
\`\`\``
            },
            {
                name: '✨ 팁',
                value: `• 여러 항목을 한 번에 추가 가능
• 안건 생성 시에도 체크리스트 추가 가능
• 체크리스트 패널에서도 추가 가능`
            }
        ]
    },
    list: {
        title: '📋 /list - 안건 목록',
        description: '등록된 안건들을 조회하는 명령어입니다.',
        fields: [
            {
                name: '📋 사용 방법',
                value: `\`/list\` - 모든 안건 조회
\`/list status:진행중\` - 진행중인 안건만 조회
\`/list owner:@사용자\` - 특정 담당자 안건 조회`
            },
            {
                name: '🎮 인터랙션 버튼',
                value: `◀️ ▶️ **페이지 이동** - 10개씩 페이지네이션
🔍 **상세 보기** - 특정 안건 상세 정보
📊 **필터** - 상태별 필터링
🔢 **페이지 점프** - 특정 페이지로 이동`
            },
            {
                name: '📊 표시 정보',
                value: `• 안건 번호와 제목
• 현재 상태 (이모지 포함)
• 담당자 멘션
• 생성 날짜`
            }
        ]
    },
    search: {
        title: '🔍 /search - 고급 검색',
        description: '대화형 필터와 페이지네이션을 통한 고급 안건 검색 명령어입니다.',
        fields: [
            {
                name: '📋 사용 방법',
                value: `1️⃣ \`/search\` 명령어 입력
2️⃣ 검색 조건 설정 (버튼 클릭)
3️⃣ 검색 실행 버튼 클릭
4️⃣ 결과 페이지 탐색`
            },
            {
                name: '🔍 검색 필터',
                value: `**키워드** - 제목/내용에서 검색
**상태** - 진행중/완료/대기중 등
**담당자** - 특정 사용자가 생성한 안건
**기간** - 날짜 범위 설정`
            },
            {
                name: '🎮 인터랙션 기능',
                value: `• **페이지네이션** - 처음/이전/다음/마지막
• **정렬 옵션** - 생성일/수정일/제목/상태
• **검색 조건 수정** - 실시간 필터 변경
• **하이라이트** - 키워드 강조 표시`
            },
            {
                name: '✨ 고급 기능',
                value: `• 여러 필터 조합 가능
• 검색 세션 자동 저장
• 빠른 필터 전환
• 결과 내 재검색`
            }
        ]
    },
    stats: {
        title: '📊 /stats - 통계 대시보드',
        description: '안건 통계를 분석하고 시각화하는 명령어입니다.',
        fields: [
            {
                name: '📋 빠른 통계',
                value: `**오늘** - 오늘 하루 통계
**이번 주** - 월요일부터 일요일까지
**이번 달** - 1일부터 말일까지
**올해** - 1월 1일부터 12월 31일까지
**지난 7일/30일** - 최근 기간 통계
**전체 기간** - 모든 데이터`
            },
            {
                name: '📈 제공 정보',
                value: `• **핵심 지표** - 총 안건, 신규 등록, 완료율
• **상태별 분포** - 각 상태별 안건 수와 비율
• **TOP 기여자** - 가장 많은 안건을 생성한 사용자
• **트렌드** - 일별 생성/완료 추이
• **시간대 분석** - 가장 활발한 시간대
• **처리 시간** - 평균/최소/최대 처리 시간`
            },
            {
                name: '🔄 기간 비교',
                value: `• 이번 주 vs 지난 주
• 이번 달 vs 지난 달
• 성장률과 변화 추이 분석`
            }
        ]
    },
    summary: {
        title: '🤖 /summary - AI 요약',
        description: 'AI를 활용하여 기간별 안건을 요약하는 명령어입니다.',
        fields: [
            {
                name: '📋 사용 방법',
                value: `1️⃣ \`/summary\` 명령어 입력
2️⃣ 기간 선택 (버튼 또는 사용자 지정)
3️⃣ AI가 자동으로 요약 생성
4️⃣ 필터링 또는 채널 게시 선택`
            },
            {
                name: '🤖 AI 분석 내용',
                value: `• 주요 성과와 완료 사항
• 진행 중인 중요 과제
• 이슈와 블로커 식별
• 다음 주 우선순위 제안
• 팀 성과 하이라이트`
            },
            {
                name: '⚙️ 필수 설정',
                value: `• Gemini API 키 설정 필요 (/setupkey)
• 요약 채널 설정 권장 (/setup)
• 자동 요약 스케줄 설정 가능`
            }
        ]
    },
    template: {
        title: '📝 /template - 템플릿 관리',
        description: '자주 사용하는 안건 양식을 템플릿으로 저장하고 재사용하는 명령어입니다.',
        fields: [
            {
                name: '📋 주요 기능',
                value: `**새 템플릿 추가** - 템플릿 생성 및 저장
**빠른 사용** - 저장된 템플릿으로 즉시 안건 생성
**템플릿 목록** - 모든 템플릿 조회
**템플릿 검색** - 키워드로 템플릿 찾기
**템플릿 수정/삭제** - 기존 템플릿 관리`
            },
            {
                name: '🔤 변수 시스템',
                value: `템플릿에 \`{{변수명}}\` 형식으로 변수 사용 가능
예시: \`{{프로젝트명}} 킥오프 미팅\`
사용 시 변수 값을 입력받아 자동 치환`
            },
            {
                name: '💡 활용 예시',
                value: `• 주간 회의 템플릿
• 스프린트 계획 템플릿
• 버그 리포트 템플릿
• 기능 요청 템플릿`
            }
        ]
    },
    edit: {
        title: '✏️ /edit - 안건 수정',
        description: '기존 안건의 내용을 수정하는 명령어입니다.',
        fields: [
            {
                name: '📋 수정 가능 항목',
                value: `**제목** - 안건 제목 변경
**내용** - 본문 내용 수정
**체크리스트** - 항목 추가/수정/삭제
**담당자** - 담당자 변경 또는 추가
**날짜** - 마감일 변경`
            },
            {
                name: '🔄 사용 순서',
                value: `1️⃣ \`/edit\` 명령어 입력
2️⃣ 수정할 안건 선택
3️⃣ 수정할 항목 선택
4️⃣ 새로운 내용 입력`
            },
            {
                name: '⚠️ 주의사항',
                value: `• 수정 내역은 자동 저장됩니다
• 스레드와 본문이 동시에 업데이트됩니다
• 완료된 안건도 수정 가능합니다`
            }
        ]
    },
    clear: {
        title: '🗑️ /clear - 안건 삭제',
        description: '안건을 일괄 삭제하는 관리자 전용 명령어입니다.',
        fields: [
            {
                name: '🔒 권한',
                value: `관리자 권한이 있는 사용자만 사용 가능`
            },
            {
                name: '📋 삭제 과정',
                value: `1️⃣ 삭제할 안건 필터 선택 (상태별)
2️⃣ 삭제 대상 목록 확인
3️⃣ 안전 문구 입력으로 최종 확인
4️⃣ 일괄 삭제 실행`
            },
            {
                name: '⚠️ 안전 장치',
                value: `• 3단계 확인 절차
• 삭제 전 상세 목록 표시
• "안건을 삭제합니다" 입력 필요
• 삭제 후 복구 불가능`
            }
        ]
    },
    link: {
        title: '🔗 /link - 링크 추가',
        description: '안건에 회의록이나 관련 문서 링크를 추가하는 명령어입니다.',
        fields: [
            {
                name: '📋 사용 방법',
                value: `1️⃣ \`/link\` 명령어 입력
2️⃣ 안건 선택 (드롭다운)
3️⃣ URL 입력 또는 템플릿 선택`
            },
            {
                name: '🔗 링크 종류',
                value: `• Google Docs 회의록
• Notion 페이지
• GitHub 이슈/PR
• Figma 디자인
• 기타 관련 문서`
            },
            {
                name: '✨ 빠른 링크',
                value: `자주 사용하는 링크 템플릿 제공
일괄 링크 추가 기능`
            }
        ]
    },
    setup: {
        title: '⚙️ /setup - 봇 설정',
        description: '서버별 봇 설정을 구성하는 관리자 전용 명령어입니다.',
        fields: [
            {
                name: '📋 설정 항목',
                value: `**tracking_channel** - 안건이 게시될 채널
**command_channel** - 명령어 사용 채널 (선택)
**allowed_role** - 명령어 사용 가능 역할 (선택)
**summary_channel** - AI 요약 게시 채널
**weekly_summary** - 자동 요약 활성화
**summary_schedule** - 요약 실행 시간`
            },
            {
                name: '🔧 설정 예시',
                value: `\`/setup tracking_channel:#안건-보드\`
\`/setup allowed_role:@팀원\`
\`/setup weekly_summary:true\``
            },
            {
                name: '💡 팁',
                value: `• 초기 설정은 필수입니다
• 설정은 언제든 변경 가능
• /checksetup으로 현재 설정 확인`
            }
        ]
    }
};

export default {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('📚 봇 사용법과 명령어 도움말')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('상세 도움말을 볼 명령어')
                .setRequired(false)
                .addChoices(
                    { name: '📝 add - 안건 등록', value: 'add' },
                    { name: '✅ done - 안건 완료', value: 'done' },
                    { name: '🔄 status - 상태 변경', value: 'status' },
                    { name: '☑️ check - 체크리스트', value: 'check' },
                    { name: '➕ addcheck - 체크리스트 추가', value: 'addcheck' },
                    { name: '📋 list - 안건 목록', value: 'list' },
                    { name: '🔍 search - 안건 검색', value: 'search' },
                    { name: '📊 stats - 통계', value: 'stats' },
                    { name: '🤖 summary - AI 요약', value: 'summary' },
                    { name: '📝 template - 템플릿', value: 'template' },
                    { name: '✏️ edit - 안건 수정', value: 'edit' },
                    { name: '🗑️ clear - 안건 삭제', value: 'clear' },
                    { name: '🔗 link - 링크 추가', value: 'link' },
                    { name: '⚙️ setup - 봇 설정', value: 'setup' }
                )),
    
    async execute(interaction) {
        if (!await ensurePermissions(interaction)) return;
        
        const command = interaction.options.getString('command');
        
        // 특정 명령어 도움말
        if (command && commandHelp[command]) {
            const help = commandHelp[command];
            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle(help.title)
                .setDescription(help.description)
                .addFields(help.fields)
                .setFooter({ text: '💡 더 자세한 도움이 필요하면 /help 를 입력하세요' })
                .setTimestamp();
            
            await interaction.reply({ 
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // 전체 도움말
        const guildSettings = getGuildSettings(interaction.guildId);
        const hasSetup = guildSettings?.tracking_channel_id ? true : false;
        
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📖 AgendaBot 사용 가이드')
            .setDescription('회의 안건을 효율적으로 관리하는 디스코드 봇입니다.\n\n**💡 특정 명령어 도움말**: `/help command:명령어이름`')
            .addFields(
                {
                    name: '📝 안건 관리',
                    value: 
`**\`/add\`** - 새 안건 등록 (대화형 메뉴)
**\`/done\`** - 안건 완료 처리
**\`/status\`** - 안건 상태 변경
**\`/edit\`** - 안건 수정
**\`/link\`** - 링크 추가`,
                    inline: true
                },
                {
                    name: '✅ 체크리스트',
                    value:
`**\`/check\`** - 항목 체크
**\`/addcheck\`** - 항목 추가
**체크리스트 패널** - 버튼 관리`,
                    inline: true
                },
                {
                    name: '🔍 조회/검색',
                    value:
`**\`/list\`** - 안건 목록
**\`/search\`** - 고급 검색`,
                    inline: true
                },
                {
                    name: '📊 분석',
                    value:
`**\`/stats\`** - 통계 대시보드
**\`/summary\`** - AI 요약`,
                    inline: true
                },
                {
                    name: '📝 템플릿',
                    value:
`**\`/template\`** - 템플릿 관리`,
                    inline: true
                },
                {
                    name: '⚙️ 설정',
                    value:
`**\`/setup\`** - 봇 설정
**\`/clear\`** - 안건 삭제
**\`/checksetup\`** - 설정 확인`,
                    inline: true
                },
                {
                    name: '🎯 빠른 시작',
                    value: hasSetup 
                        ? '✅ 설정 완료! `/add` 명령어로 첫 안건을 만들어보세요.'
                        : '⚠️ `/setup` 명령어로 초기 설정을 완료해주세요.',
                    inline: false
                },
                {
                    name: '💬 명령어별 상세 도움말',
                    value: '`/help command:add` 형식으로 각 명령어의 자세한 사용법을 확인할 수 있습니다.',
                    inline: false
                },
                {
                    name: hasSetup ? '✅ 현재 설정' : '⚠️ 설정 필요',
                    value: hasSetup 
                        ? `출력: <#${guildSettings.tracking_channel_id}> | API: ${guildSettings.ai_api_key_encrypted ? '✅' : '❌'}`
                        : '초기 설정이 필요합니다.',
                    inline: false
                }
            )
            .setFooter({ text: 'AgendaBot v4.5 | 특정 명령어 도움말: /help command:명령어' })
            .setTimestamp();
        
        await interaction.reply({ 
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    },
};