# Real-Time Voice UI Redesign

**Date:** 2026-06-02
**Status:** Approved
**Scope:** Frontend — RealTimeVoice page UI overhaul

## Motivation

The current `RealTimeVoice.tsx` (543 lines) has three problems:

1. **Scattered UI** — transcript in the center, coach tips in a separate sidebar. The coach sidebar forces eye-jumps between conversation and coaching advice.
2. **Mobile-hostile** — sidebar doesn't work on narrow screens; coach tips hide behind a floating FAB.
3. **Monolithic** — all JSX in one file: history sidebar, transcript, coach sidebar, recording controls, customer picker, error state.

The redesign inlines coach tips directly into the conversation flow — where the salesperson is already looking — and splits the page into focused, testable components.

## Design Decisions (Resolved)

| Decision | Option A (chosen) | Option B (rejected) |
|---|---|---|
| Coach placement | Inline in chat flow | Hybrid desktop-sidebar + mobile-inline |
| Component split | 4 new + 1 hook + reuse existing | Merge ChatBubble + CoachBubble |
| Mobile approach | Unified inline (same as desktop) | Adaptive (different layouts per breakpoint) |

## Layout (2-Column)

```
┌─────────────────────────────────────────────────────────┐
│ [☰] 实时陪跑 · 张先生        🟢 LIVE │ 02:35           │  ← Header
├──────────┬──────────────────────────────────────────────┤
│ History  │  ┌──────────────────────────────────────┐    │
│ Sidebar  │  │         🎙️ 录音开始 · 张先生         │    │  ← System
│ (toggle) │  └──────────────────────────────────────┘    │
│          │         ┌──────────────────┐                 │
│ Session  │         │ 销售气泡 (蓝色)   │                │  ← ChatBubble
│ 1        │         └──────────────────┘                 │
│ Session  │  ┌──────────────────┐                        │
│ 2  ●     │  │ 客户气泡 (灰色)   │                       │  ← ChatBubble
│          │  └──────────────────┘                        │
│          │  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐            │
│          │  │ 💡 策略建议 · 价格异议     ⏱│            │  ← CoachBubble
│          │  │ 客户提到"太贵了"...         │            │     (centered, dashed)
│          │  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘            │
│          │                                                │
├──────────┴──────────────────────────────────────────────┤
│              [ 🔴 停止录音 ]  02:35                       │  ← RecordingBar
└──────────────────────────────────────────────────────────┘
```

- **Desktop**: history sidebar (collapsible, 60px collapsed / 240px expanded) + main chat area
- **Mobile**: sidebar is off-canvas overlay; RecordingBar fixed to bottom with safe-area padding

## Component Architecture

### New Components

| File | Lines (est.) | Responsibility |
|---|---|---|
| `components/ChatBubble.tsx` | ~50 | Pure display: `isSelf` → right-blue / left-gray, speaker label, timestamp, confidence dot |
| `components/CoachBubble.tsx` | ~90 | Inline coach tip: centered dashed-card, 7 trigger color schemes, fade-in/fade-out animation, 10s auto-dismiss, pin/dismiss buttons |
| `components/RecordingBar.tsx` | ~60 | Bottom bar: start/stop button, elapsed timer, connection status indicator, red recording pulse |
| `components/CustomerPicker.tsx` | ~40 | Dropdown search → select → display chip. Reusable for post_sales. |
| `hooks/useCoachTips.ts` | ~70 | Queue management: `addTip()` → active queue, 10s timer → auto-archive, `pinTip()` → pinned set, `dismissTip()` → immediate archive. Exposes `activeTips`, `pinnedTips`, `historyTips`. |

### Modified Files

| File | Change |
|---|---|
| `pages/RealTimeVoice.tsx` | 543 → ~150 lines. Assembles sub-components, manages top-level state (recording, session list, replay mode). Removes inline `TranscriptChat`, coach sidebar JSX, all helper functions. |
| `types/index.ts` | Add `CoachTipDisplay` type: `{id, trigger, action, content, color, icon, timestamp, isPinned}` |
| `hooks/useRealtimeASR.ts` | No changes (already refactored in prior session) |

### Deleted Files

| File | Reason |
|---|---|
| `components/RealtimeCoach.tsx` | Coach panel replaced by inline CoachBubble |

## Chat Bubble Design

### Three Bubble Types

| Role | Alignment | Background | Border | Radius |
|---|---|---|---|---|
| Sales (self) | Right | `var(--btn-blue)` (#1f6feb) | none | 16px 16px 4px 16px |
| Customer | Left | `var(--bg-primary)` | `var(--border-default)` | 16px 16px 16px 4px |
| Coach | Center | transparent + low-opacity accent | dashed accent | 12px all |

### Coach Bubble — 7 Trigger Colors

| Trigger Rule | Icon | Label | Accent Color |
|---|---|---|---|
| `hesitation` | 💡 | 策略建议 | `#a371f7` (purple) |
| `price_objection` | 💰 | 价格异议 | `#ff7b72` (red) |
| `competitor_mention` | 🔍 | 竞品分析 | `#d29922` (amber) |
| `commitment_signal` | ⭐ | 销售金句 | `#3fb950` (green) |
| `objection` | ⚠️ | 反对处理 | `#ffa657` (orange) |
| `long_silence` | 🧊 | 静默提醒 | `#79c0ff` (blue) |
| `emotional_shift` / `multi_party` | 🎯 | 情绪感知 | `#ff7be1` (pink) |

### Coach Bubble States

1. **NEW** — highlighted background glow (`box-shadow`), "NEW" badge, full opacity
2. **AUTO-DISMISSING** — 10s countdown, fade opacity, timer badge "⏱ Xs"
3. **PINNED** — solid border (not dashed), "📌 已钉住" badge, no auto-dismiss
4. **DISMISSED** — removed from visible flow, moved to history (available via "历史提示" toggle)

### Interaction

- **Pin**: stops auto-dismiss, solid border, stays until unpinned or new tip arrives
- **Dismiss**: immediate removal from visible flow
- **History**: last 20 tips accessible via a toggle button in chat header

## Data Flow

```
MediaRecorder → PCM chunks → WebSocket ──→ Backend ASR Pipeline
                                            │
                    ┌───────────────────────┘
                    ▼
              WebSocket JSON messages
                    │
        ┌───────────┼──────────────┐
        ▼           ▼              ▼
   transcript   coach_tip      session_start
        │           │              │
        ▼           ▼              ▼
   chat bubble   useCoachTips   session_id
   queue         .addTip()
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
      activeTips  pinnedTips  historyTips
          │          │
          ▼          ▼
      CoachBubble  CoachBubble
      (centered,   (centered,
       dashed,     solid border,
       auto-fade)  no auto-dismiss)
```

1. `useRealtimeASR` hook manages WebSocket + MediaRecorder — unchanged
2. New `useCoachTips` hook wraps `setCoachTip` from useRealtimeASR:
   - On new tip → push to `activeTips`, schedule 10s auto-dismiss
   - On pin → move to `pinnedTips`, cancel timer
   - On dismiss → move to `historyTips`
3. `RealTimeVoice` maps active+pinned tips to `CoachBubble` components interleaved with `ChatBubble` transcript segments in rendering order
4. Bubble insertion logic: coach tips appear immediately after the transcript segment that triggered them (timestamp-based interleaving)

## Theme Support

All components use CSS variables exclusively — no hardcoded colors:

- `var(--bg-primary)`, `var(--bg-secondary)` — backgrounds
- `var(--text-primary)`, `var(--text-placeholder)` — text
- `var(--border-default)`, `var(--border-subtle)` — borders
- `var(--btn-blue)` — sales bubble
- Coach bubble accent colors use `style={{ borderColor: accentColor }}` with inline styles (these are semantic colors, not theme-bound)

Dark mode (default): `#0d1117` base. Light mode: `#FFF8F0` base.

## Responsive Breakpoints

| Breakpoint | Layout |
|---|---|
| < 768px (mobile) | Sidebar off-canvas (overlay + backdrop), RecordingBar fixed bottom, full-width chat, coach bubbles at 92% width |
| >= 768px (tablet+) | Sidebar inline (collapsible), same bubble layout |
| >= 1024px (desktop) | Full 2-column with sidebar expanded by default |

## Risk & Edge Cases

- **Empty state**: No sessions → show illustration + "开始实时陪跑" CTA
- **Connection lost**: Error banner + auto-reconnect (already in useRealtimeASR, 3 retry, exponential backoff)
- **Very long session**: Virtualize? Not needed for MVP — sessions are typically < 30 min, ~100-200 segments
- **No microphone**: Graceful error message in RecordingBar
- **Coach LLM timeout**: Tip never arrives → no CoachBubble rendered (graceful degradation)

## Files Changed Summary

```
frontend/src/
├── pages/RealTimeVoice.tsx          # MODIFY: 543→~150 lines
├── components/
│   ├── ChatBubble.tsx               # NEW
│   ├── CoachBubble.tsx              # NEW
│   ├── RecordingBar.tsx             # NEW
│   ├── CustomerPicker.tsx           # NEW
│   ├── RealtimeCoach.tsx            # DELETE
│   └── RealtimeTranscript.tsx       # DELETE (replaced by ChatBubble)
├── hooks/
│   ├── useRealtimeASR.ts            # No change (already clean)
│   └── useCoachTips.ts              # NEW
└── types/index.ts                   # MODIFY: add CoachTipDisplay type
```

## Non-Goals (Out of Scope)

- TTS voice synthesis / voice interrupt (Phase 4, deferred)
- Backend changes (WebSocket, ASR, trigger engine all unchanged)
- TrainingSession or PostSalesSession UI (these pages already use chat bubbles; could adopt ChatBubble later)
