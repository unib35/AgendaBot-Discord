# AgendaBot - Discord 회의 안건 관리 봇

[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/node.js-20%2B-green.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

<div align="center">

[**운영 가이드**](docs/OPERATION_GUIDE.md) •
[**기여 가이드**](docs/CONTRIBUTING.md) •
[**변경 로그**](docs/CHANGELOG.md) •
[**프로젝트 요약**](docs/PROJECT_SUMMARY.md)

</div>

---

## Overview

회의 안건을 체계적으로 관리하고 AI로 자동 요약하는 Discord 봇입니다.

## Features

- **안건 관리**: 대화형 메뉴를 통한 단계별 안건 등록 및 상태 추적
- **체크리스트**: 실시간 진행률 표시 및 일괄 관리
- **AI 요약**: Gemini API를 통한 지능형 요약 (인터랙티브 기간 선택)
- **통계 대시보드**: 실시간 통계, TOP 기여자, 기간 비교 분석
- **서버별 설정**: 독립적인 채널/권한/AI 설정 관리
- **템플릿 시스템**: 자주 사용하는 안건 형식 저장 및 재사용
- **안건 편집**: 제목, 내용, 체크리스트 실시간 수정


## Installation

### Requirements

- Node.js 20.0 이상
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Google AI Studio API Key ([Google AI Studio](https://makersuite.google.com/app/apikey)) - AI 요약 기능용 (선택)

### Step 1: Clone and Install

```bash
# 저장소 클론
git clone https://github.com/unib35/AgendaBot-Discord.git
cd AgendaBot-Discord

# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일을 편집하여 필요한 값 입력
```

### Step 2: Configure Environment

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

### Step 3: Run Bot

```bash
# 슬래시 명령어 Discord에 배포 (최초 1회 또는 명령어 변경 시)
npm run deploy

# 봇 시작
npm start

# 개발 모드 (자동 재시작)
npm run dev
```

## Commands

### 안건 관리
| 명령어 | 설명 | 특징 |
|--------|------|------|
| `/add` | 새 안건 등록 | 대화형 메뉴로 단계별 입력 |
| `/done` | 안건 완료 | 드롭다운 메뉴로 선택 |
| `/status` | 상태 변경 | 진행중/대기중/완료 등 상태 변경 |
| `/edit` | 안건 수정 | 제목, 내용, 체크리스트 편집 |
| `/link` | 링크 추가 | 회의록 링크 연결 |
| `/template` | 템플릿 관리 | 템플릿 저장/사용/삭제 |

### 체크리스트
| 명령어 | 설명 | 특징 |
|--------|------|------|
| `/check` | 체크리스트 관리 | 드롭다운으로 안건 선택, 버튼으로 항목 토글 |
| `/addcheck` | 항목 추가 | 기존 안건에 체크리스트 추가 |

### 조회 및 검색
| 명령어 | 설명 | 특징 |
|--------|------|------|
| `/list` | 안건 목록 | 상태/담당자/정렬 필터링 |
| `/search` | 안건 검색 | 키워드로 빠른 검색 |
| `/stats` | 통계 대시보드 | 인터랙티브 버튼, 기간 비교, TOP 기여자 |

### AI 요약
| 명령어 | 설명 | 특징 |
|--------|------|------|
| `/summary` | AI 요약 | 버튼으로 기간 선택, 상태 필터, 채널 게시 |
| `/testsummary` | AI 테스트 | Gemini API 연결 테스트 |

### 설정 (관리자 전용)
| 명령어 | 설명 | 특징 |
|--------|------|------|
| `/setup` | 봇 설정 | 채널, 권한, 자동 요약 스케줄 설정 |
| `/setupkey` | API 키 설정 | 모달로 안전한 Gemini API 키 입력 |
| `/checksetup` | 설정 확인 | 현재 서버 설정 상태 확인 |
| `/clear` | 데이터 정리 | 오래된 안건 정리 (관리자 전용) |

### 유틸리티
| 명령어 | 설명 | 특징 |
|--------|------|------|
| `/help` | 도움말 | 전체 도움말 또는 특정 명령어 상세 설명 |
| `/ping` | 상태 확인 | 응답 속도 및 가동 시간 표시 |

## Server Configuration

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


## Project Structure

```
AgendaBot/
├── src/
│   ├── commands/       # 슬래시 명령어
│   ├── handlers/       # 이벤트 핸들러
│   ├── db/            # 데이터베이스
│   ├── utils/         # 유틸리티
│   ├── ai/            # AI 통합
│   └── index.js       # 메인 엔트리
├── docs/              # 문서
│   ├── OPERATION_GUIDE.md
│   ├── CONTRIBUTING.md
│   ├── CHANGELOG.md
│   └── PROJECT_SUMMARY.md
├── meeting.db         # SQLite 데이터베이스
├── .env.example       # 환경 변수 템플릿
├── package.json       # 프로젝트 설정
└── README.md         # 이 문서
```

## Contributing

프로젝트에 기여하고 싶으신가요? [기여 가이드](docs/CONTRIBUTING.md)를 확인해주세요!

- [버그 신고](https://github.com/unib35/AgendaBot-Discord/issues/new?labels=bug)
- [기능 제안](https://github.com/unib35/AgendaBot-Discord/issues/new?labels=enhancement)
- [문서 개선](docs/CONTRIBUTING.md#문서-개선)
- [코드 기여](docs/CONTRIBUTING.md#코드-기여)

## License

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

## Links

### Documentation
- [운영 가이드](docs/OPERATION_GUIDE.md) - 봇 사용 방법 상세 설명
- [기여 가이드](docs/CONTRIBUTING.md) - 개발 참여 방법
- [변경 로그](docs/CHANGELOG.md) - 버전별 변경 사항
- [프로젝트 요약](docs/PROJECT_SUMMARY.md) - 기술 상세 정보

### External Links
- [Discord.js 문서](https://discord.js.org)
- [Gemini API 문서](https://ai.google.dev/docs)
- [Discord 개발자 포털](https://discord.com/developers/applications)

### Support
- [문제 신고](https://github.com/unib35/AgendaBot-Discord/issues)
- [토론](https://github.com/unib35/AgendaBot-Discord/discussions)
- [위키](https://github.com/unib35/AgendaBot-Discord/wiki)

## Contact

- Discord: [Discord 서버 링크]
- Email: jm.jongminlee@gmail.com

---

**AgendaBot v5.0** - AI와 인터랙티브 UI로 더욱 스마트해진 회의 관리
