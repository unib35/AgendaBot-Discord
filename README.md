# 📋 AgendaBot - Discord 회의 안건 관리 봇

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/node.js-20%2B-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

회의 안건을 체계적으로 관리하고 AI로 자동 요약하는 Discord 봇입니다.

## ✨ 주요 기능

- 📝 **안건 관리**: 구조화된 안건 등록 및 상태 추적
- ✅ **체크리스트**: 실시간 진행률 표시 및 일괄 관리
- 🤖 **AI 요약**: Gemini API를 통한 주간/월간 자동 요약
- 📊 **통계 분석**: 기간별 안건 통계 및 진행 현황
- 🔐 **서버별 설정**: 독립적인 채널/권한/AI 설정 관리

## 🚀 빠른 시작

### 필수 요구사항

- Node.js 20.0 이상
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Google AI Studio API Key ([Google AI Studio](https://makersuite.google.com/app/apikey)) - AI 요약 기능용 (선택)

### 설치

```bash
# 저장소 클론
git clone https://github.com/yourusername/AgendaBot.git
cd AgendaBot

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 편집하여 필요한 값 입력
```

### 환경 변수 설정

`.env` 파일에 다음 값들을 설정하세요:

```env
# 필수
DISCORD_TOKEN=your_bot_token_here
DISCORD_APP_ID=your_application_id_here

# 선택
DEV_GUILD_ID=        # 개발 서버 ID (빈 값이면 글로벌 배포)
SQL_DEBUG=0          # SQL 쿼리 로깅 (1: 활성화)
TIMEZONE=Asia/Seoul  # 시간대 설정

# 보안
ENCRYPTION_SECRET=   # API 키 암호화용 (openssl rand -hex 32)
```

### 봇 실행

```bash
# 슬래시 명령어 Discord에 배포 (최초 1회 또는 명령어 변경 시)
npm run deploy

# 봇 시작
npm start

# 개발 모드 (자동 재시작)
npm run dev
```

## 📖 명령어 목록

### 안건 관리
| 명령어 | 설명 | 사용 예시 |
|--------|------|----------|
| `/add` | 새 안건 등록 (2단계 입력) | `/add` → 담당자 선택 → 상세 정보 입력 |
| `/done` | 안건 완료 처리 | `/done id:1` |
| `/status` | 안건 상태 변경 | `/status id:1 status:보류` |
| `/link` | 회의록 링크 추가 | `/link id:1 url:https://...` |

### 체크리스트
| 명령어 | 설명 | 사용 예시 |
|--------|------|----------|
| `/check` | 개별 체크박스 토글 | `/check id:1 item:2` |
| `/checkall` | 전체 체크박스 일괄 처리 | `/checkall id:1 action:모두 완료` |
| `/addcheck` | 체크리스트 항목 추가 | `/addcheck id:1 item:테스트 작성` |

### 조회 및 검색
| 명령어 | 설명 | 사용 예시 |
|--------|------|----------|
| `/list` | 안건 목록 조회 | `/list status:진행중 owner:@user` |
| `/search` | 키워드로 안건 검색 | `/search keyword:로그인` |
| `/stats` | 기간별 통계 조회 | `/stats from:2024-01-01 to:2024-01-31` |

### AI 요약
| 명령어 | 설명 | 사용 예시 |
|--------|------|----------|
| `/summary` | AI 요약 생성 | `/summary range:이번주 preview:true` |
| `/testsummary` | AI 설정 테스트 | `/testsummary post:false` |

### 설정 (관리자 전용)
| 명령어 | 설명 | 사용 예시 |
|--------|------|----------|
| `/setup` | 봇 설정 구성 | `/setup tracking_channel:#안건 summary_day:월요일 summary_time:09:00` |
| `/setupkey` | Gemini API 키 설정 | `/setupkey` → 모달에 키 입력 |

### 유틸리티
| 명령어 | 설명 | 사용 예시 |
|--------|------|----------|
| `/help` | 도움말 표시 | `/help` |
| `/ping` | 봇 상태 확인 | `/ping` |

## ⚙️ 서버 설정 가이드

### 1. 초기 설정
```
/setup tracking_channel:#안건채널 command_channel:#명령채널
```

### 2. AI 요약 설정
```
# API 키 설정 (관리자 전용, 모달 입력)
/setupkey

# 자동 요약 스케줄 설정
/setup weekly_enabled:true summary_day:월요일 summary_time:09:00
```

### 3. 권한 제한 (선택)
```
/setup allowed_role:@운영진
```

## 🏗️ 프로젝트 구조

```
AgendaBot/
├── src/
│   ├── commands/       # 슬래시 명령어
│   ├── handlers/       # 이벤트 핸들러
│   ├── db/            # 데이터베이스
│   ├── utils/         # 유틸리티
│   ├── ai/            # AI 통합
│   └── index.js       # 메인 엔트리
├── meeting.db         # SQLite 데이터베이스
├── .env.example       # 환경 변수 템플릿
├── package.json       # 프로젝트 설정
└── README.md         # 이 문서
```

## 🤝 기여하기

[CONTRIBUTING.md](CONTRIBUTING.md)를 참고해주세요.

## 📝 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

## 🔗 링크

- [운영 가이드](OPERATION_GUIDE.md) - 봇 사용 방법 상세 설명
- [변경 로그](CHANGELOG.md) - 버전별 변경 사항
- [문제 신고](https://github.com/yourusername/AgendaBot/issues)

## 💡 문의

- Discord: your-discord-server
- Email: your-email@example.com

---

**AgendaBot v4.0** - AI와 함께하는 스마트한 회의 관리