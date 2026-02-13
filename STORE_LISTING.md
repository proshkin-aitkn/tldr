# Chrome Web Store Listing — TL;DR

Use this document when filling out the Chrome Web Store submission form.

---

## Extension Name
TL;DR

## Short Description (132 chars max)
Summarize any page or YouTube video with AI — image analysis, diagrams, and chat. Bring your own key, no subscription needed.

## Detailed Description (for store listing)

TL;DR gives you AI-powered summaries of any web page or YouTube video — right in Chrome's side panel.

Three steps to knowledge capture:

1. Summarize — Get a structured summary of any web page or YouTube video with key takeaways, notable quotes, and tags
2. Refine — Chat with the AI to adjust the summary, ask follow-up questions, or request diagrams and custom sections
3. Save & Share — Export to Notion or Markdown with all metadata, tags, and source links preserved. Share any summary via a Notion public link.

Works everywhere:

  - Articles and blog posts
  - YouTube videos (transcripts + top comments + full description)
  - Reddit threads (post + comment tree with scores)
  - X/Twitter threads (full conversation with engagement data)
  - Facebook posts (text, images, reactions, and comments)
  - GitHub (PRs, issues, code, repos, commits, and releases)
  - Google Docs
  - SPAs and web apps (Claude, ChatGPT, etc.)
  - Any web page

Image analysis: Vision-capable models automatically analyze page images — charts, infographics, screenshots — and incorporate them into the summary. The extension auto-detects each model's vision support (no configuration needed).

Visual diagrams: The AI generates Mermaid flowcharts, sequence diagrams, and timelines when content describes processes or architectures. Ask for any diagram in chat and it renders inline with full light/dark theme support.

Bring your own API key — no subscription, no account.
Works with OpenAI (GPT-4o), Anthropic (Claude), Google Gemini, xAI (Grok), DeepSeek, or any self-hosted OpenAI-compatible endpoint (Ollama, vLLM, etc.)

More features:

  - Guided setup wizard — step-by-step onboarding walks you through provider, model, Notion, and preferences in under a minute
  - Quick detail toggle — cycle between Brief, Standard, and Detailed summaries with one click in the header
  - Light, dark, and system themes
  - Configurable summary language and detail level
  - Auto-translation of summaries and notable quotes into your preferred language
  - Session persistence — summaries survive tab reloads and navigation
  - Smart copy — rich text for Google Docs + plain markdown, diagrams export as images
  - Print any summary directly from the side panel
  - Table extraction and data charts from structured page content
  - Markdown export for offline use
  - Custom extra sections via chat (cheat sheets, reference tables, etc.)

Privacy-first: No data collection, no analytics, no backend server. Your API keys stay on your device. Content is sent directly to the AI provider you choose.

---

## Category
Productivity

## Language
English

---

## Single Purpose Description (required by Chrome Web Store)
Summarize web page and YouTube video content using AI.

---

## Permissions Justification (required for each permission)

### activeTab
Used to read the text content of the page the user is currently viewing. The extension reads page metadata (title, word count) when the side panel opens to display content indicators. The extracted content is only sent to an external AI provider when the user explicitly clicks "Summarize".

### sidePanel
The extension's user interface is displayed in Chrome's side panel. This permission is required to register and open the side panel.

### storage
Used to persist user settings (theme preference, summary language, detail level) and API key configurations locally on the user's device using chrome.storage.local.

### scripting
Used to inject the content extraction script into the active tab when the user requests a summary. The script extracts the page's text content for summarization.

### tabs
Used to detect when the user switches, reloads, or navigates a tab so the side panel can display the correct page metadata. Also used to identify the target tab for content extraction when the side panel is the active context. During the onboarding wizard, the extension opens API-key provider pages (e.g. OpenAI, Anthropic) and Notion integration setup pages in new tabs, and offers to close them when setup is complete.

### Host permissions (<all_urls>)
Required to extract text content from any web page. The extension reads page metadata (title, word count) when the side panel opens. The extracted content is only sent to an external AI provider when the user explicitly clicks "Summarize". Broad host permissions are necessary because the extension supports summarizing content from any website.

---

## Screenshots Needed (you'll need to take these yourself)

1. **Main summary view** — showing a completed summary with key takeaways, on an article page (1280x800 or 640x400)
2. **YouTube summary** — showing a YouTube video being summarized with transcript and comment indicators
3. **Chat refinement** — showing a follow-up question and response in the chat area
4. **Settings panel** — showing the settings drawer with provider configuration
5. **Dark mode** — showing the extension in dark theme

Tips for good screenshots:
- Use a clean browser window with no other extensions visible
- Pick visually interesting content (a popular article or YouTube video)
- Show the side panel alongside the actual page content
- Capture at 1280x800 for best quality

---

## Store Icon
Already included: `public/icons/icon-128.png`
(Chrome Web Store also accepts a 128x128 PNG for the store tile)
