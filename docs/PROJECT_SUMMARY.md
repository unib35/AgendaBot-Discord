# AgendaBot v5.0 - 프로젝트 요약

## 주요 기능

### 1. 안건 관리
- `/add` - 대화형 메뉴로 단계별 안건 생성 (담당자 선택 → 정보 입력 모달)
- `/done` - 드롭다운으로 안건 선택 후 완료 처리
- `/status` - 드롭다운으로 상태 변경 (진행중/완료/보류/취소/검토중/대기중)
- `/link` - 회의록 링크 추가
- `/edit` - 안건 제목, 내용, 체크리스트 수정
- `/template` - 템플릿 저장/사용/관리

### 2. 체크리스트 관리
- `/check` - 인터랙티브 패널로 체크리스트 관리
- `/addcheck` - 드롭다운으로 안건 선택 후 항목 추가
- 자동 진행률 표시 및 프로그레스 바

### 3. 조회 및 검색
- `/list` - 인터랙티브 필터링으로 안건 목록 조회
- `/search` - 고급 검색 필터 (키워드, 상태, 담당자, 날짜)
- `/stats` - 인터랙티브 통계 대시보드 (TOP 기여자, 기간 비교)

### 4. 리마인더 기능
- `/reminder` - 리마인더 대시보드 (예정된 회의, 리마인더 관리)
- 리마인더 종류: 7일 전, 1일 전, 당일, 30분 전
- 반복 안건 설정 (매일, 매주, 격주, 매월)
- 자동 리마인더 발송 (cron 스케줄러)

### 5. AI 요약 (Gemini API)
- `/summary` - 인터랙티브 기간 선택으로 AI 요약 생성
- `/testsummary` - AI 연결 테스트
- 자동 주간 요약 스케줄링
- 서버별 독립적인 API 키 관리 (암호화 저장)

### 6. 서버 설정 및 관리
- `/setup` - 서버별 봇 설정 (관리자 전용)
  - 채널 설정: 출력 채널, 명령 채널, 요약 채널
  - 권한 설정: 허용 역할, 멘션 억제
  - AI 설정: 모델 선택, 자동 요약 스케줄
  - 리마인더 기본 정책 설정
- `/setupkey` - API 키 설정 (모달 입력, 암호화 저장)
- `/checksetup` - 현재 서버 설정 확인
- `/clear` - 오래된 안건 정리 (관리자 전용)
- `/help` - 명령어별 상세 도움말
- `/ping` - 봇 상태 및 응답 시간 확인

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
- meeting_date: 회의 예정 날짜
- reminder_policy: 리마인더 정책
- recurrence_pattern: 반복 패턴
- meeting_link: 회의록 링크
- created_at: 생성 시간
- updated_at: 수정 시간
- completed_at: 완료 시간
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
- reminder_default_policy: 리마인더 기본 정책
```

### templates 테이블
```sql
- id: 템플릿 ID
- guild_id: 서버 ID
- key: 템플릿 키 (고유한 식별자)
- title: 템플릿 제목
- body: 템플릿 본문
- checklist: 체크리스트 항목
- visibility: 가시성 (guild/private)
- created_by: 생성자
```

### reminders 테이블
```sql
- id: 리마인더 ID
- topic_id: 안건 ID (Foreign Key)
- type: 리마인더 타입 (7d/1d/0d/30m)
- scheduled_at: 예약 시간
- delivered_at: 발송 시간
- notification_type: 알림 타입 (channel/dm)
- retry_count: 재시도 횟수
- recurrence_index: 반복 인덱스
```

## 최신 업데이트 (v5.0)

### 주요 기능 추가

1. **리마인더 시스템**
   - 리마인더 대시보드로 통합 관리
   - 4단계 리마인더 (7일/1일/당일/30분 전)
   - 반복 안건 지원 (매일/매주/격주/매월)
   - 자동 리마인더 발송

2. **인터랙티브 UI 전면 개편**
   - 모든 주요 명령어에 버튼과 드롭다운 메뉴 적용
   - 세션 기반 상태 관리로 복잡한 상호작용 처리
   - 대화형 메뉴를 통한 단계별 안건 생성

3. **템플릿 시스템**
   - 자주 사용하는 안건 형식 저장/재사용
   - 템플릿 키를 통한 빠른 접근
   - 체크리스트 포함 템플릿

4. **통계 대시보드 개선**
   - 실시간 통계 시각화 (프로그레스 바)
   - TOP 기여자 표시
   - 기간 비교 분석 기능
   - 인터랙티브 버튼으로 빠른 기간 선택

5. **AI 요약 개선**
   - 인터랙티브 날짜 선택 버튼
   - 상태별 필터링 기능
   - 미리보기/게시 옵션

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

- [OPERATION_GUIDE.md](./OPERATION_GUIDE.md) - 봇 사용법 상세 가이드
- [CONTRIBUTING.md](./CONTRIBUTING.md) - 개발 참여 가이드
- [CHANGELOG.md](./CHANGELOG.md) - 버전별 변경 사항
- [CLAUDE.md](../CLAUDE.md) - AI 어시스턴트를 위한 프로젝트 가이드
- [.env.example](../.env.example) - 환경 변수 설정 예시

## 기여

이슈 및 PR은 언제나 환영합니다!

---

**Version**: 5.0
**Last Updated**: 2025-01-17  
**License**: MIT