# AgendaBot v5.0 - 프로젝트 요약

## 주요 기능

### 1. 안건 관리
- `/add` - 2단계 입력 (담당자 선택 → 상세 정보 입력)
- `/done` - 안건 완료 처리
- `/status` - 6가지 상태 변경 (진행중/완료/보류/취소/검토중/대기중)
- `/link` - 회의록 링크 추가

### 2. 체크리스트 관리
- `/check` - 개별 체크박스 토글
- `/checkall` - 전체 체크박스 일괄 처리
- `/addcheck` - 체크리스트 항목 추가
- 자동 진행률 표시 (예: 2/4 50%)

### 3. 조회 및 검색
- `/list` - 상태/담당자별 필터링
- `/search` - 키워드 검색
- `/stats` - 기간별 통계 조회

### 4. AI 요약 (Gemini API)
- `/summary` - 주간/월간 AI 요약 생성
- `/testsummary` - AI 설정 테스트
- 자동 주간 요약 (Cron 스케줄)
- 서버별 독립적인 API 키 관리 (암호화 저장)

### 5. 서버 설정
- `/setup` - 서버별 봇 설정 (관리자 전용)
  - 출력 채널, 명령 채널, 권한 역할
  - AI 요약 채널, 자동 요약 설정
  - Gemini 모델 선택
- `/setupkey` - API 키 설정 (모달 입력, 암호화 저장)
- `/help` - 도움말 및 현재 설정 확인
- `/ping` - 봇 상태 확인

## 기술 스택

- **Framework**: Discord.js v14
- **Database**: SQLite3 (better-sqlite3)
- **AI**: Google Generative AI (Gemini)
- **Scheduler**: node-cron
- **Security**: AES-256-GCM 암호화
- **Runtime**: Node.js 20+ (ES Modules)

## 데이터베이스 스키마

### topics 테이블
```sql
- id: 자동 증가 안건 번호
- guild_id: 서버 ID
- channel_id: 채널 ID
- message_id: 메시지 ID
- thread_id: 스레드 ID
- title: 안건 제목
- status: 상태 (진행중/완료/보류/취소/검토중/대기중)
- created_by: 생성자
- created_at: 생성 시간
- updated_at: 수정 시간
```

### guild_settings 테이블
```sql
- guild_id: 서버 ID (Primary Key)
- tracking_channel_id: 출력 채널
- command_channel_id: 명령 채널
- allowed_role_id: 권한 역할
- summary_channel_id: 요약 채널
- weekly_summary_enabled: 자동 요약 활성화
- weekly_summary_cron: Cron 표현식
- week_start: 주 시작일 (MON/SUN)
- ai_provider: AI 제공자 (gemini)
- gemini_model: Gemini 모델
- ai_api_key_encrypted: 암호화된 API 키
- mention_suppress: 멘션 억제 설정
```

## 최신 업데이트 (v5.0)

1. **AI 통합**
   - Gemini API를 통한 지능형 요약
   - 서버별 독립적인 API 키 관리
   - 자동 주간 요약 스케줄링

2. **향상된 UX**
   - UserSelectMenu를 통한 실제 Discord 멘션
   - 버튼 인터랙션으로 빠른 작업
   - 진행률 자동 계산 및 표시

3. **보안 강화**
   - API 키 AES-256-GCM 암호화
   - 서버별 독립적인 설정 관리
   - 권한 기반 접근 제어

4. **한국어 완전 지원**
   - 모든 사용자 메시지 한국어화
   - 에러 메시지 및 로그 한국어화
   - 직관적인 한국어 명령어

## 보안 고려사항

- API 키는 모달을 통해 입력받아 Discord 채팅 기록에 남지 않음
- 모든 API 키는 AES-256-GCM으로 암호화하여 데이터베이스 저장
- 서버별 독립적인 설정으로 데이터 격리
- 관리자 전용 명령어 권한 체크

## 설치 및 실행

```bash
# 의존성 설치
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일 편집

# 슬래시 명령어 배포
npm run deploy

# 봇 실행
npm start

# 개발 모드 (자동 재시작)
npm run dev
```

## 향후 개선 사항

- [ ] 다국어 지원 확장
- [ ] 더 많은 AI 모델 지원
- [ ] 웹 대시보드 구현
- [ ] 백업 및 복원 기능
- [ ] 고급 통계 및 분석 기능

## 문서

- [CLAUDE.md](./CLAUDE.md) - AI 어시스턴트를 위한 프로젝트 가이드
- [.env.example](./.env.example) - 환경 변수 설정 예시

## 기여

이슈 및 PR은 언제나 환영합니다!

---

**Version**: 5.0
**Last Updated**: 2025-01-17  
**License**: MIT