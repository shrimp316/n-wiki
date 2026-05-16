# n위키 리디자인 — 적용 가이드

## 변경 사항 요약

| 기존 | 새 디자인 |
|------|----------|
| 상단 sticky 네비바 | 상단 그라디언트 헤더 (햄버거 + 타이틀 + 알림) |
| 본문 내 3탭 (카카오/개념/토론) | 하단 3탭 네비 (홈·담론·찬반의견) |
| 없음 | 좌측 슬라이드 사이드바 (on/off) |
| 흰색 배경 | 파란-민트 그라디언트 + 글래스모피즘 카드 |

---

## 파일 적용 방법

### 1. 폰트 설치 (package.json이 있는 루트에서)
```bash
# Google Fonts는 layout.tsx에서 직접 로드하므로 별도 설치 불필요
# 단, next/font를 쓰고 싶다면:
npm install @next/font
```

### 2. 컴포넌트 파일 교체

```
new-components/AppHeader.tsx  →  components/AppHeader.tsx  (신규)
new-components/BottomNav.tsx  →  components/BottomNav.tsx  (신규)
new-components/Sidebar.tsx    →  components/Sidebar.tsx    (신규)
new-components/layout.tsx     →  app/layout.tsx            (교체)
new-components/page.tsx       →  app/page.tsx              (교체)
new-components/globals.css    →  app/globals.css           (교체)
```

### 3. 기존 Navbar.tsx 처리

`components/Navbar.tsx`는 더 이상 메인에서 사용하지 않습니다.  
단, 하위 페이지(wiki/[slug], discussions/[id] 등)에서 아직 import하고 있다면  
**AppHeader로 교체**하거나 임시로 유지하세요.

```tsx
// 기존 하위 페이지들에서
// import Navbar from '@/components/Navbar'   ← 제거
import AppHeader from '@/components/AppHeader'  // ← 추가

// 그리고 컴포넌트 안에서
// <Navbar />  ← 제거
<AppHeader onMenuOpen={() => {}} title="페이지 제목" />  // ← 추가
```

> **사이드바를 하위 페이지에서도 쓰려면** Sidebar 상태를 상위로 올리거나  
> Zustand/Context로 전역 관리하는 것을 권장합니다.

---

## 디자인 토큰 (globals.css)

| 변수 | 값 | 용도 |
|------|-----|------|
| `--hdr-from` | `#41b0f8` | 헤더 그라디언트 시작 |
| `--hdr-to` | `#3dd9b0` | 헤더 그라디언트 끝 |
| `--active` | `#1a8cf5` | 강조색 (탭 활성, 링크) |
| `--text` | `#0d1f3c` | 본문 텍스트 |
| `--muted` | `#8faec8` | 보조 텍스트 |
| `--card-bg` | `rgba(255,255,255,0.82)` | 글래스 카드 배경 |

색상을 바꾸고 싶다면 `globals.css`의 `:root` 변수만 수정하세요.

---

## 주요 컴포넌트 API

### `<AppHeader>`
```tsx
<AppHeader
  onMenuOpen={() => setSidebarOpen(true)}
  title="N의 위키"   // 선택사항, 기본값: 'N의 위키'
/>
```

### `<BottomNav>`
```tsx
<BottomNav
  activeTab={tab}              // 'home' | 'discussion' | 'procon'
  onTabChange={(t) => setTab(t)}
/>
```

### `<Sidebar>`
```tsx
<Sidebar
  isOpen={sidebarOpen}
  onClose={() => setSidebarOpen(false)}
  activeTab={tab}
  onTabChange={(t) => setTab(t)}
/>
```
