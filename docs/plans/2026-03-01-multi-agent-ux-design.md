# Multi-Agent UX Design: Mission Control

## Overview

Redesign the heyworkly desktop app UI/UX to support the multi-agent orchestrator. The core concept: the main window transforms into a compact floating "Mission Control" widget during execution, while the user's desktop becomes the stage. A branded heyworkly cursor performs actions with visual effects, and the widget shows plan progress with full user control.

## Design Principles

- **Conversational and warm** (Claude/ChatGPT style) — approachable to non-technical users
- **Plan + execution visible simultaneously** — the widget shows the plan while agents execute on screen
- **Full user control** — pause, stop, skip steps, retry, change agents mid-run
- **Rich visual feedback** — magic cursor effects, tool execution toasts, blue glow border states
- **Smart error collapse** — retry badges with expandable details

---

## 1. Home Page — Single Entry Point

Replace the current two-card operator selection with a single centered input field.

### Layout

- Large centered heyworkly branding with shimmer gradient
- Prominent textarea input: "What would you like me to do?"
- File attachment support (paperclip button + drag-and-drop)
- Suggestion chips below input for common tasks
- Three card rows: Recent tasks / Saved workflows / Memory hints
- Settings gear in corner
- No operator selection — the orchestrator decides which agents to use

### Legacy Fallback

When `multiAgentEnabled` is false in settings, the home page falls back to the current operator card selection (Computer / Browser). This preserves backward compatibility.

### Route Change

- New route `/` renders the new home page with single input
- The `/local` route still works for direct navigation and legacy mode
- After submitting a task, the app creates a session and transitions to the execution experience

---

## 2. Execution Experience — Five Phases

### Phase 1: Planning (1-3 seconds)

Main window shows a centered "Planning your task..." card with animated shimmer effect. The Planner agent decomposes the instruction into steps. Brief — typically under 3 seconds.

### Phase 2: Plan Reveal + Window Transform

1. Plan steps appear in the main window with staggered entrance animation (each step slides in 100ms apart)
2. Brief pause (1s) so user can read the plan
3. Main window smoothly **shrinks and slides** to bottom-right corner (~400x350px)
4. Blue glow border **fades in** around the entire screen (enhanced `showScreenWaterFlow`)
5. The heyworkly cursor **materializes** at center screen with a sparkle burst animation

### Phase 3: Active Execution — Magic on Screen

The user's entire desktop is the stage. Three visual layers:

**Layer 1: Blue Glow Border (full screen, always-on-top)**
- Idle/Planning: Soft blue pulse (current behavior)
- Active tool execution: Glow brightens and flows faster
- Step completion: Brief green flash
- Error/retry: Brief amber flash
- Finished: Glow smoothly fades out

**Layer 2: heyworkly Cursor (overlay window, always-on-top, click-through)**

The branded cursor moves smoothly between action targets. It has:
- Gradient pointer arrow (blue-to-purple)
- Ambient glow outline (energy field effect)
- "heyworkly" brand badge always visible below cursor
- Action-specific visual effects:
  - **Click**: Triple ripple burst (blue rings expanding outward)
  - **Type**: Glowing beam from cursor + floating text preview showing what's being typed
  - **Scroll**: Directional particle trail (arrow indicators floating in scroll direction)
  - **Drag**: Dashed trail line from start to end with glow
  - **Hotkey**: Key badge flash near cursor (e.g., "⌘+C" appears for 1.5s)
  - **Navigate**: Portal swirl effect as page changes
  - **Waiting**: Gentle pulse/breathing animation
  - **Thinking**: Orbiting sparkle dots around cursor (model is processing)

**Layer 3: Tool Execution Toasts (near cursor)**

As each tool call fires, a small toast appears near the cursor position:
- Shows tool name and arguments: `gui_click(".submit")`
- Fades after 1.5 seconds
- Success: subtle green check
- Failure: subtle red X

For API/MCP tool calls (no screen position), the toast appears in the mini widget instead, rendered as a rich card (see Section 3).

### Phase 4: Step Transitions

When one plan step finishes and the next begins:
1. Cursor plays a celebration micro-animation (sparkle burst)
2. Widget updates: completed step gets checkmark, next step highlights with blue
3. If agent type changes (Browser → Desktop → API), an agent badge appears next to cursor for 2 seconds
4. Progress bar in widget advances smoothly

### Phase 5: Completion — Toast + Auto-Expand

1. Cursor plays a final celebration animation and fades out
2. Centered screen toast: "All done! 5 steps · 32 seconds" (fades after 2 seconds)
3. Blue glow border fades out
4. Mini widget smoothly **expands back** into the full main window
5. Results view is displayed (see Section 4)

---

## 3. Mini Mission Control Widget

A ~400x350px floating window, always-on-top, positioned at bottom-right. This is the main window after it transforms — same Electron BrowserWindow, just resized and repositioned.

### Layout

```
┌──────────────────────────────────────────┐
│  ✦ heyworkly           ⏸  ■  ⟳  ↗     │
│──────────────────────────────────────────│
│  ✓ 1. Search flights        🌐 Browser  │
│  ● 2. Select cheapest       🌐 Browser  │
│    └─ gui_click(".price")  ✓             │
│    └─ dom_getText(".total") ✓            │
│    └─ gui_click(".select")  ●            │
│  ○ 3. Fill booking form     🌐 Browser  │
│  ○ 4. Confirm via email     🔗 API      │
│──────────────────────────────────────────│
│  ┌──────────┐  Step 2 of 4              │
│  │screenshot│  Browser Agent             │
│  │ preview  │  3 tool calls · 4.2s       │
│  └──────────┘                            │
│  ████████░░░░░░░  50%                    │
└──────────────────────────────────────────┘
```

### Header Controls

| Button | Action |
|--------|--------|
| ⏸ Pause | Freezes execution. Steps stay in current state. Cursor stops moving. |
| ■ Stop | Aborts entirely. Widget expands to show partial results. |
| ⟳ Retry | Re-run the current failed step. |
| ↗ Expand | Immediately expand widget back to full app. Execution continues in background. |

### Step List

- **Completed steps**: ✓ green tint
- **Active step**: ● blue highlight, expanded to show live tool call sub-list
- **Pending steps**: ○ dimmed gray
- **Failed step**: ✗ red, "Retried 2x" badge (click to expand error details)
- **Agent badges**: 🌐 Browser, 🖥 Desktop, 🔗 API
- **Right-click context menu** on any step: Skip / Retry / Change Agent

### Active Step Detail

Below the step list:
- Screenshot thumbnail (latest, updates in real-time, clickable for full-size overlay)
- Step counter: "Step 2 of 4"
- Agent name: "Browser Agent"
- Stats: tool call count, elapsed time

### Progress Bar

Smooth animated bar at bottom. Percentage = completed steps / total steps.

### Rich Cards for API/MCP Results

When an API or MCP tool call completes, results render as rich cards in the widget:

```
┌──────────────────────────────┐
│  📧 Email Sent                │
│  To: user@example.com        │
│  Subject: "Booking Confirm"  │
│  Status: Delivered ✓         │
└──────────────────────────────┘
```

Card types: email preview, GitHub issue, Slack message, HTTP response (status + body preview), generic JSON.

### Widget Visual Style

- Dark semi-transparent background with blur (glassmorphism)
- Content-protected (not captured in screenshots sent to VLM)
- Ignores mouse events by default (click-through) except when hovering the widget itself
- Smooth resize animation when expanding/collapsing tool call sub-lists

---

## 4. Results View — Post-Execution

When the widget expands back to full window after task completion.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ✦ heyworkly                                    ⚙ Settings  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ✅ Task Complete · 5 steps · 34s · 3 agents used           │
│                                                             │
│  ┌── Plan Summary (clickable steps) ───────────────────┐   │
│  │ ✓ 1. Search Google Flights           🌐  2.1s       │   │
│  │ ✓ 2. Select cheapest option          🌐  4.3s       │   │
│  │ ✓ 3. Fill passenger details          🌐  8.7s       │   │
│  │ ✓ 4. Confirm via email               🔗  3.2s       │   │
│  │ ✓ 5. Screenshot confirmation         🖥  1.0s       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌── Rich Result Cards ────────────────────────────────┐   │
│  │  (MCP/API results rendered as visual cards)          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌── Screenshot Gallery ───────────────────────────────┐   │
│  │  [img1]  [img2]  [img3]  [img4]  [img5]             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  What else can I do for you?                 📎  ➤  │    │
│  └────────────────────────────────────────────────────┘    │
│                                                             │
│  💡 Memory: Saved "NYC→London flights" workflow             │
└─────────────────────────────────────────────────────────────┘
```

### Task Summary Banner

Shows total steps, elapsed time, agent count. Green for success, amber for partial failure, red for full failure.

### Expandable Plan Steps

Each step is clickable to expand full execution detail:

```
✓ 2. Select cheapest option              🌐  4.3s   ▼
├─ gui_click(".sort-by-price")           ✓  0.3s
├─ dom_getText(".flight-card:first .price")  ✓  0.2s
│  Result: "$347 round trip"
├─ gui_click(".flight-card:first .select")   ✓  0.5s
├─ screenshot                             ✓  0.8s
│  [thumbnail]
└─ Retried 1x (first attempt: element not found)  ⚠️
   └─ Error: ".flight-card:first" not visible — waited 2s, retried
```

### Rich Result Cards

API/MCP results render as visual cards with structured data:
- Email: sender, subject, status
- GitHub issue: number, title, labels, URL
- Slack message: channel, content, timestamp
- HTTP response: status code, body preview
- Generic: JSON with syntax highlighting, truncated to 500 chars

### Screenshot Gallery

Horizontal scrollable row of thumbnail screenshots from all steps. Click to view full-size in a lightbox overlay with previous/next navigation.

### Follow-Up Input

Same chat input component, repositioned. User can chain tasks: "Now book the hotel too."

### Memory Hint

Subtle bar at bottom showing what the memory system learned: "Saved NYC→London flights workflow" or "Remembered: you prefer window seats."

---

## 5. Data Flow — Backend to UI

### New IPC Events

The orchestrator needs to push real-time state to the renderer. New events on the Zustand bridge:

| Event | Payload | When |
|-------|---------|------|
| `orchestrator:plan-created` | `{ steps: PlanStep[] }` | After Planner finishes |
| `orchestrator:step-start` | `{ stepId, agent, task }` | When a step begins |
| `orchestrator:step-complete` | `{ stepId, success, result, retries }` | When a step finishes |
| `orchestrator:tool-call` | `{ stepId, toolName, args, status }` | Each tool call in real-time |
| `orchestrator:tool-result` | `{ stepId, toolName, result }` | Tool call result |
| `orchestrator:cursor-move` | `{ x, y, action }` | Cursor position update |
| `orchestrator:complete` | `{ success, totalTime, stepResults[] }` | Full run complete |

### State Shape (AppState additions)

```typescript
orchestratorPlan: PlanStep[] | null;
orchestratorStepResults: Map<number, StepResult>;
orchestratorActiveStep: number | null;
orchestratorToolCalls: ToolCallEvent[];
cursorPosition: { x: number; y: number; action: string } | null;
```

### Window Transform Flow

1. Main `BrowserWindow` stores its current bounds before shrinking
2. `win.setBounds({ x, y, width: 400, height: 350 })` with `animate: true`
3. On completion: `win.setBounds(originalBounds)` with `animate: true`
4. During widget mode: `win.setAlwaysOnTop(true, 'floating')`

---

## 6. Cursor Overlay Implementation

The heyworkly cursor is a separate always-on-top `BrowserWindow` (similar to the existing `currentOverlay` in ScreenMarker). It:

- Is full-screen, transparent, frameless, click-through
- Renders only the cursor SVG + effects via a small HTML page
- Receives position updates via IPC from the orchestrator
- Animates smoothly between positions using CSS transitions (cubic-bezier easing)
- Shows action-specific effects via CSS animations triggered by action type
- Is content-protected (VLM screenshots don't see it)
- Hides during `screenshot` tool calls (same as current overlay behavior)

### Cursor Actions → Effects Map

| Action | Visual Effect | Duration |
|--------|--------------|----------|
| `gui_click` | Triple expanding rings + ripple | 600ms |
| `gui_type` | Glowing beam + floating text preview | Duration of typing |
| `gui_scroll` | Directional arrow particles | 400ms |
| `gui_drag` | Dashed trail line with glow | Duration of drag |
| `gui_hotkey` | Key badge flash near cursor | 1500ms |
| `page_navigate` | Portal swirl ring | 800ms |
| `screenshot` | Camera flash (brief white overlay) | 200ms |
| Thinking | Orbiting sparkle dots | Until next action |
| Step complete | Sparkle burst celebration | 500ms |
| Agent switch | Agent badge slide-in near cursor | 2000ms |

---

## 7. Component Architecture

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `HomePage` | `pages/home/index.tsx` | New single-input home page (replaces operator cards) |
| `MissionControlWidget` | `components/MissionControl/Widget.tsx` | The mini floating plan view during execution |
| `PlanStepList` | `components/MissionControl/PlanStepList.tsx` | Vertical step list with status indicators |
| `PlanStepDetail` | `components/MissionControl/PlanStepDetail.tsx` | Expandable tool call detail for a step |
| `ToolCallEntry` | `components/MissionControl/ToolCallEntry.tsx` | Single tool call with name, args, status |
| `RichResultCard` | `components/MissionControl/RichResultCard.tsx` | Visual cards for API/MCP results |
| `ScreenshotPreview` | `components/MissionControl/ScreenshotPreview.tsx` | Small thumbnail, clickable to full-size |
| `ProgressBar` | `components/MissionControl/ProgressBar.tsx` | Animated step progress bar |
| `ResultsView` | `pages/results/index.tsx` | Post-execution full results with expandable steps |
| `PlanSummary` | `components/Results/PlanSummary.tsx` | Completed plan with timing and agent info |
| `ScreenshotGallery` | `components/Results/ScreenshotGallery.tsx` | Horizontal scrollable thumbnail strip |
| `MemoryHint` | `components/Results/MemoryHint.tsx` | Subtle memory learning notification |
| `SuggestionChips` | `components/Home/SuggestionChips.tsx` | Task suggestion pills on home page |
| `RecentTasks` | `components/Home/RecentTasks.tsx` | Recent task cards on home page |

### Modified Main Process Components

| Component | Change |
|-----------|--------|
| `ScreenMarker.ts` | New `showCursorOverlay()` method for the magic cursor window |
| `ScreenMarker.ts` | Enhanced `showScreenWaterFlow()` with action-reactive glow states |
| `window/index.ts` | New `transformToWidget()` and `expandFromWidget()` for window morphing |
| `Orchestrator.ts` | Emit IPC events for each phase (plan, step, tool call, cursor, complete) |
| `runMultiAgent.ts` | Wire orchestrator callbacks to IPC event emitters |

---

## 8. Migration Strategy

The new UI is additive — the old single-agent experience still works when `multiAgentEnabled` is false.

| Setting | Home Page | Execution |
|---------|-----------|-----------|
| `multiAgentEnabled: false` | Current operator cards | Current GUIAgent loop with existing UI |
| `multiAgentEnabled: true` | New single-input page | Mission Control widget + magic cursor |

Users toggle between modes in Settings → Model → Multi-Agent Mode switch.
