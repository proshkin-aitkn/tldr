# Chrome Web Store Listing — TL;DR

Use this document when filling out the Chrome Web Store submission form.

---

## Extension Name
TL;DR

## Short Description (132 chars max)
Summarize any page or YouTube video with AI, refine via chat, and save to Notion. Bring your own key — no subscription needed.

## Detailed Description (for store listing)

TL;DR gives you AI-powered summaries of any web page or YouTube video — right in Chrome's side panel.

Three steps to knowledge capture:

1. Summarize — Get a structured summary of any web page or YouTube video with key takeaways, notable quotes, and tags
2. Refine — Chat with the AI to adjust the summary, ask follow-up questions, or dig deeper into specific topics
3. Save — Export to Notion with all metadata, tags, and source links preserved

Works everywhere:

  - Articles and blog posts
  - YouTube videos (transcripts + top comments)
  - Google Docs
  - Any web page

Bring your own API key — no subscription, no account.
Works with OpenAI (GPT-4o), Anthropic (Claude), Google Gemini, xAI (Grok), DeepSeek, or any self-hosted OpenAI-compatible endpoint (Ollama, vLLM, etc.)

More features:

  - Light, dark, and system themes
  - Configurable summary language and detail level
  - Auto-translation of summaries into your preferred language

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
