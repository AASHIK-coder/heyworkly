# Multi-Agent Orchestrator Design for heyworkly Desktop

**Date:** 2026-03-01
**Status:** Approved
**Author:** Engineering Team

---

## Problem Statement

Users report three critical issues with the current heyworkly agent:
1. **Inaccuracy** - The agent clicks wrong elements, misinterprets screens, and gets stuck in loops
2. **No tool calling** - The agent can only see screenshots and poke coordinates. It cannot call APIs, query DOM, run scripts, or interact with external services
3. **Limited to GUI** - Every task requires clicking through UIs, even when a direct API call would be faster and more reliable

**Root cause:** The current architecture is a single-model, vision-only, text-prediction loop with no structural understanding of what's on screen and no ability to use tools.

---

## Solution: Multi-Agent Orchestrator

Replace the single agent loop with a multi-agent system where a Planner decomposes tasks and routes them to specialized agents with tool calling capabilities.

### Architecture Overview

```
User Instruction
        |
        v
+------------------+
|  PLANNER AGENT   |  (Best reasoning model, 1 call per task)
|  Decomposes task  |
|  Routes subtasks  |
+--------+---------+
         |
    +----+----+----------+
    v         v          v
+--------+ +--------+ +--------+
|BROWSER | |DESKTOP | |  API   |
| AGENT  | | AGENT  | | AGENT  |
|        | |        | |        |
|Vision+ | |Vision+ | |MCP+    |
|DOM+    | |A11y+   | |REST+   |
|Tools   | |Tools   | |Shell   |
+---+----+ +---+----+ +---+----+
    |          |           |
    +-----+----+-----+----+
          v          v
   +------------+ +----------+
   |  VERIFIER  | |  MEMORY  |
   | Rule-based | | SQLite   |
   | state diff | | Learning |
   +------------+ +----------+
```

---

## Agent Specifications

### 1. Planner Agent (The Brain)

**Purpose:** Decomposes complex user instructions into ordered subtask plans.

**Model:** Best available reasoning model (user-configurable)
- Recommended: `anthropic/claude-opus-4.6`, `openai/gpt-5.1`, `google/gemini-3-pro-preview`

**Input:**
- User instruction (natural language)
- Available MCP tools summary
- Memory context (past workflows, user preferences)
- Current system state (which apps are open, current URL)

**Output:** Structured JSON execution plan:
```json
{
  "plan": [
    { "id": 1, "agent": "browser", "task": "...", "depends_on": [], "verify": true },
    { "id": 2, "agent": "api", "task": "...", "depends_on": [1], "verify": true }
  ]
}
```

**Responsibilities:**
- Decompose complex instructions into atomic subtasks
- Assign each subtask to the best agent (browser/desktop/api)
- Track step dependencies and execution order
- Handle failures: retry, replan, or escalate to user
- Pass intermediate results between agents

### 2. Browser Agent (Web Specialist)

**Purpose:** Automates web browser tasks with vision + DOM understanding + tool calling.

**Model:** VLM with tool calling (user-configurable)
- Recommended: `anthropic/claude-sonnet-4.6`, `google/gemini-3-flash-preview`, `moonshotai/kimi-k2.5`
- UI-TARS supported: Handles GUI actions while a secondary model handles tool calls

**Perception (Hybrid Vision + DOM):**
- Screenshots (existing desktopCapturer / CDP capture)
- DOM snapshot via CDP `DOM.getDocument` + `DOM.describeNode`
- Accessibility tree via CDP `Accessibility.getFullAXTree`
- Model receives BOTH screenshot AND structured element list

**Tools:**

| Tool | Description |
|------|------------|
| `gui_click(selector_or_coords)` | Click by CSS selector OR coordinates (fallback) |
| `gui_type(selector, text)` | Type into element by selector |
| `gui_scroll(direction, amount)` | Scroll page |
| `gui_hotkey(keys)` | Press keyboard shortcut |
| `dom_query(selector)` | Query DOM, return matching elements |
| `dom_getText(selector)` | Extract text content |
| `dom_getAttribute(selector, attr)` | Get attribute value |
| `js_evaluate(code)` | Execute JavaScript on page |
| `page_navigate(url)` | Go to URL |
| `page_waitFor(selector, timeout)` | Wait for element to appear |
| `network_intercept(urlPattern)` | Capture API responses |

### 3. Desktop Agent (Native App Specialist)

**Purpose:** Automates native desktop applications with vision + accessibility tree + tools.

**Model:** VLM with tool calling (user-configurable)
- Recommended: `anthropic/claude-sonnet-4.6`, `openai/gpt-4.1`
- UI-TARS supported: Handles GUI actions while secondary model handles tool calls

**Perception (Hybrid Vision + Accessibility Tree):**
- Screenshots (existing desktopCapturer with DPI fix)
- OS accessibility tree:
  - macOS: AXAccessibility API
  - Windows: UI Automation API
- Element list with: role, name, bounding box, value, enabled state

**Tools:**

| Tool | Description |
|------|------------|
| `gui_click(element_id_or_coords)` | Click by accessibility element or coordinates |
| `gui_type(text)` | Type text (clipboard method on Windows) |
| `gui_hotkey(keys)` | Press keyboard shortcut (OS-aware) |
| `gui_scroll(direction)` | Scroll |
| `gui_drag(start, end)` | Drag operation |
| `a11y_query(role, name)` | Find element by accessibility role/name |
| `a11y_getTree()` | Get full accessibility tree of focused window |
| `file_read(path)` | Read file content |
| `file_write(path, content)` | Write file |
| `shell_exec(command)` | Run shell command |
| `clipboard_get/set()` | Read/write clipboard |

### 4. API Agent (Direct Integrations)

**Purpose:** Interacts with services directly via MCP servers and REST APIs. No GUI.

**Model:** Text model with tool calling (no vision needed)
- Recommended: `anthropic/claude-haiku-4.5`, `openai/gpt-4.1-mini`, `google/gemini-3-flash-preview`

**Tools:**

| Tool | Description |
|------|------------|
| `mcp_call(server, tool, params)` | Call any configured MCP server tool |
| `http_request(method, url, body, headers)` | Make HTTP/REST calls |
| `shell_exec(command)` | Run shell commands |
| `file_read/write(path, content)` | File system access |
| `json_transform(data, expression)` | Transform data |

**MCP servers** (dynamically loaded from user config):
- Gmail, Outlook, Slack, GitHub, Notion, Google Sheets, Calendar, Jira, Linear
- Filesystem, Shell, PostgreSQL, Browser
- Any custom MCP server the user adds

### 5. Memory Agent (Learning System)

**Purpose:** Persists knowledge across sessions to make the system smarter over time.

**Storage:** Local SQLite database (privacy-first, never leaves device)

**Memory types:**

| Type | Example | Used By |
|------|---------|---------|
| User preferences | "User prefers Chrome, email is X" | Planner |
| Workflow patterns | "To book a flight: Google Flights -> cheapest -> check bags" | Planner |
| Element maps | "Submit button on site X = selector `.btn-primary`" | Browser Agent |
| Failure corrections | "Clicking (450,300) missed, actual button is `#search-btn`" | All agents |
| Credentials/context | "Work email: team@company.com" (encrypted) | API Agent |

**Integration:**
- Planner queries before planning: "Have we done something similar?"
- Agents query during execution: "What selector worked last time?"
- Verifier writes after success/failure: "This approach worked/failed"

### 6. Verifier (Post-Action Checker)

**Purpose:** Confirms each action succeeded. Rule-based, no model calls needed.

**Verification methods:**

| Agent | How It Verifies |
|-------|----------------|
| Browser | DOM state changed (element appeared/disappeared, URL changed, text updated) |
| Desktop | Screenshot perceptual hash diff > threshold, accessibility tree changed |
| API | HTTP response 2xx, MCP tool returned success |

**Recovery cascade on failure:**
1. **Level 1:** Retry same action (max 2x)
2. **Level 2:** Try alternative method (vision click -> DOM click, coordinate -> selector)
3. **Level 3:** Fall back from GUI to API (if MCP tool exists for the service)
4. **Level 4:** Replan (Planner creates new approach)
5. **Level 5:** `call_user` (ask human for help)

---

## UI-TARS Integration

UI-TARS remains a first-class model option for GUI automation. When selected:

- **Two-model pattern:** UI-TARS handles GUI actions (click, type, scroll, drag) with its superior coordinate prediction. A secondary tool-calling model (Haiku/Flash) handles DOM queries, API calls, and system tools.
- UI-TARS uses its native `<|box_start|>(x,y)<|box_end|>` coordinate format
- General VLMs use standard `[x1,y1,x2,y2]` coordinate format with tool calling

---

## Model Configuration (Settings Page Redesign)

### Per-Agent Model Selection

Users configure one OpenRouter API key, then select models per agent role:

| Setting | Description | Default |
|---------|------------|---------|
| **Provider** | OpenRouter or Custom (OpenAI-compatible) | OpenRouter |
| **API Key** | Single key for all agents | - |
| **Planner Model** | Best reasoning model | `anthropic/claude-opus-4.6` |
| **Browser Agent Model** | VLM with tool calling | `google/gemini-3-flash-preview` |
| **Desktop Agent Model** | VLM with tool calling | `anthropic/claude-sonnet-4.6` |
| **API Agent Model** | Fast text model | `anthropic/claude-haiku-4.5` |

### Quick Presets

| Preset | Planner | Browser | Desktop | API |
|--------|---------|---------|---------|-----|
| Performance | claude-opus-4.6 | claude-sonnet-4.6 | claude-sonnet-4.6 | claude-sonnet-4.6 |
| Balanced | claude-sonnet-4.6 | gemini-3-flash | claude-sonnet-4.6 | claude-haiku-4.5 |
| Budget | gemini-2.5-pro | gemini-2.5-flash | qwen3-vl | qwen3-235b |

### Recommended Models on OpenRouter (March 2026)

| Model ID | Name | Vision | Tool Calling | Best For | Price (in/out /M) |
|----------|------|--------|-------------|----------|-------------------|
| `anthropic/claude-opus-4.6` | Claude Opus 4.6 | Yes | Yes | Planner | $5 / $25 |
| `anthropic/claude-sonnet-4.6` | Claude Sonnet 4.6 | Yes | Yes | Agent | $3 / $15 |
| `anthropic/claude-haiku-4.5` | Claude Haiku 4.5 | Yes | Yes | Fast agent | $0.80 / $4 |
| `openai/gpt-5.1` | GPT-5.1 | Yes | Yes | Planner | ~$5 / $15 |
| `openai/gpt-4.1` | GPT-4.1 | Yes | Yes | Agent | $2 / $8 |
| `openai/gpt-4.1-mini` | GPT-4.1 Mini | Yes | Yes | Fast agent | $0.40 / $1.60 |
| `google/gemini-3-pro-preview` | Gemini 3 Pro | Yes | Yes | Planner (1M ctx) | ~$1.25 / $5 |
| `google/gemini-3-flash-preview` | Gemini 3 Flash | Yes | Yes | Fast agent | ~$0.15 / $0.60 |
| `google/gemini-2.5-pro` | Gemini 2.5 Pro | Yes | Yes | Agent | $1.25 / $5 |
| `google/gemini-2.5-flash` | Gemini 2.5 Flash | Yes | Yes | Fast agent | $0.15 / $0.60 |
| `moonshotai/kimi-k2.5` | Kimi K2.5 | Yes | Yes | Agent | $0.40 / $2 |
| `deepseek/deepseek-v3.2` | DeepSeek V3.2 | Yes | Yes | Agent | ~$0.50 / $2 |
| `qwen/qwen3-vl` | Qwen3 VL | Yes | Yes | Vision agent | $0.20 / $0.88 |
| `qwen/qwen3-235b-a22b` | Qwen3 235B | No | Yes | API agent | $0.07 / $0.10 |
| `bytedance/ui-tars-1.5-7b` | UI-TARS 1.5 7B | Yes | No | GUI specialist | varies |

### MCP Tools Settings Tab

New settings tab for configuring MCP server integrations:
- Gallery of popular MCP servers (Gmail, Slack, GitHub, Notion, etc.)
- Custom server configuration (name, command, args, env vars)
- Per-server tool discovery and connection status
- Test connection button per server

---

## Prompt Architecture

### Planner Prompt

Receives: user instruction, available MCP tools summary, memory context, current system state.
Outputs: JSON execution plan with steps, agent assignments, dependencies, verification flags.
Key rules: prefer API agent when MCP tool exists; break into atomic subtasks; include verification steps.

### Browser Agent Prompt

Receives: screenshot, accessibility tree, available tools.
Strategy: First query accessibility tree to understand page, then act via selectors (not coordinates).
Key innovation: selector-based clicks instead of coordinate guessing.

### Desktop Agent Prompt

Receives: screenshot, OS accessibility tree, available tools.
Strategy: Query accessibility tree, find elements by role+name, fall back to coordinates only when needed.
OS-aware: Platform-specific keyboard shortcuts injected into prompt.

### API Agent Prompt

Receives: available MCP tool definitions, task description.
Strategy: Use MCP tools when available, handle errors with retries, return structured results.

### Verifier (No Prompt — Rule-Based)

Pure code: DOM diff for browser, screenshot perceptual hash diff for desktop, HTTP status for API.

---

## Cross-Platform Compatibility

| Component | macOS | Windows | Implementation |
|-----------|-------|---------|---------------|
| Planner | Same | Same | Pure LLM, no platform dependency |
| Browser (DOM) | Same | Same | CDP is platform-agnostic |
| Browser (Vision) | Same | Same | DPI fix already applied |
| Desktop (Vision) | Same | Same | DPI fix already applied |
| Desktop (A11y) | AXAccessibility | UI Automation | Platform-specific adapters |
| Desktop (Actions) | nut.js | nut.js + clipboard | Already fixed |
| API / MCP | Same | Same | Node.js, cross-platform |
| Memory (SQLite) | Same | Same | better-sqlite3, cross-platform |
| Verifier | Same | Same | Pure code |

---

## Latency Optimization

### Strategy

1. **Planner uses smart model once** (~2-3s), executor agents use fast models (many calls)
2. **Verifier is rule-based** (no LLM calls, ~0.1s)
3. **Independent steps run in parallel**
4. **DOM/accessibility trees cached** between steps (re-fetched only on change)
5. **Memory provides cached selectors** from past runs

### Estimated Latency Per Step

| Phase | Time |
|-------|------|
| Planner (1 call total) | 2-3s |
| Screenshot + DOM/A11y extraction | 0.3-0.5s |
| Agent model call (with tools) | 1-2s (fast model) |
| Action execution | 0.1-0.5s |
| Verification (rule-based) | 0.1s |
| **Total per step** | **~2-4s** |

Current system: ~3-5s per step. New system is roughly same speed but massively more capable.

---

## Data Flow

```
User types: "Find cheapest flight to NYC, email details to team"
    |
    v
Planner Agent (Claude Opus 4.6):
    "I'll break this into 4 steps"
    Step 1: browser -> "Search Google Flights for NYC"
    Step 2: browser -> "Extract flight details" (depends on 1)
    Step 3: api -> "Send email via Gmail MCP" (depends on 2)
    Step 4: verifier -> "Confirm email sent" (depends on 3)
    |
    v
Step 1 executes (Browser Agent + Gemini Flash):
    1. dom_getAccessibilityTree() -> sees search box
    2. gui_click("#search-input") -> clicks by selector
    3. gui_type("#search-input", "NYC flights March 15")
    4. gui_click("button[aria-label='Search']")
    5. Verifier: DOM changed, results appeared -> SUCCESS
    |
    v
Step 2 executes (Browser Agent):
    1. dom_query(".flight-result .price") -> extracts prices
    2. js_evaluate("...") -> sorts and finds cheapest
    3. Returns: {airline: "Delta", price: "$245", time: "2:30pm"}
    |
    v
Step 3 executes (API Agent + Gmail MCP):
    1. mcp_call("gmail", "send_email", {to: "team@...", body: "..."})
    2. Returns: {status: "sent", messageId: "abc123"}
    |
    v
Step 4: Verifier confirms email sent (API returned 200)
    |
    v
Planner: "All steps complete. Task finished."
Memory: Saves workflow pattern for future reference
```

---

## Implementation Phases (Suggested)

### Phase 1: Tool-Calling Foundation
- Extend SDK Model class to support OpenAI `tools` parameter
- Add tool execution loop in GUIAgent (model calls tool -> execute -> return result -> model continues)
- Browser Agent: Add DOM extraction tools via CDP
- Update settings to support per-agent model selection

### Phase 2: Multi-Agent Orchestration
- Implement Planner Agent with JSON plan output
- Implement agent dispatcher (routes subtasks to correct agent)
- Implement step dependency tracking and result passing
- Add Verifier with DOM diff and screenshot diff

### Phase 3: Desktop Accessibility + MCP
- Implement OS accessibility tree extraction (macOS + Windows)
- Desktop Agent with a11y-based tools
- MCP server manager (launch, discover tools, lifecycle)
- API Agent with MCP tool calling
- MCP settings tab in UI

### Phase 4: Memory System
- SQLite database for persistent memory
- Memory query API for agents
- Auto-save workflow patterns and element maps
- Failure correction learning

### Phase 5: Settings UI Redesign
- Per-agent model selection dropdowns
- Quick presets (Performance / Balanced / Budget)
- MCP Tools gallery and custom server config
- Cost indicators per model

---

## Sources

- [OpenRouter Models](https://openrouter.ai/models)
- [OpenRouter Tool Calling Docs](https://openrouter.ai/docs/guides/features/tool-calling)
- [Tool Calling Models Collection](https://openrouter.ai/collections/tool-calling-models)
- [Claude Opus 4.6 on OpenRouter](https://openrouter.ai/anthropic/claude-opus-4.6)
- [Gemini 3 Pro Preview](https://openrouter.ai/google/gemini-3-pro-preview)
- [Gemini 3 Flash Preview](https://openrouter.ai/google/gemini-3-flash-preview)
