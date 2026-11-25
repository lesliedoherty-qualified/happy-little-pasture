/** @jsxImportSource preact */
// Dumps the real PiperX messenger (Main), collapsed or closed, with the preview bubble in a
// different state per capture, for site/preview.html: Preview > TimelinePreview >
// PreviewMessageRenderer, the message Piper shows next to the collapsed messenger or launcher (the
// pounce, or a rep's unread follow-up).
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-preview.sh copies it into
// fireball's multimodal_v2/components/app/, runs it through `mise run test:js`, then deletes it,
// so fireball is never left modified. Imports are relative to that fireball location.
//
// Output (PREVIEW_DUMP_DIR): one <layout>--<state>.html per display mode and state, and
// states.json listing them with the theme custom properties and the image placeholders.
//
// The stylesheet doesn't come from here: refresh-preview.sh runs `panda cssgen` itself.
import * as fs from "fs";
import { render, waitFor } from "@testing-library/preact";
import { RootStoreContext } from "../../stores/root_store";
import { createMockRootStore, mockVideoElement, setupPandaCss } from "../../test_utils";
import { ButtonShape, ButtonStyle, ConversationMode, DisplayMode, type ThemeConfig } from "../../types";
import * as mediaQueries from "../../utils/media_queries";
import { applyThemeCssVars } from "../../utils/theme_styles";
import { Main } from "./Main";

// Same stub as the booker dump: src/validation is an .erb module rendered through Rails.
jest.mock("src/validation", () => ({
  emailRegexp: /.+@.+/,
  nameRegexp: /.*/,
  numberRegexp: /.*/,
  validateEmail: () => [true, null],
}));

// The composer's placeholder, where a collapsed card shows one: as on the Composer page, a
// stand-in for useTextOverflow (jsdom has no widths), which the frame measures again.
const mockOverflow: { fallback: { value: string } | null } = { fallback: null };
jest.mock("../helpers/useTextOverflow", () => ({
  useTextOverflow: (_ref: unknown, text: { value: string }, fallback: { value: string }) => {
    mockOverflow.fallback = fallback;
    return text;
  },
}));

const OUT = process.env.PREVIEW_DUMP_DIR || "/tmp/preview-dump";

const AI_AVATAR = "https://example.com/avatar.png";
const REP_AVATAR = "https://example.com/rep.png";
// Placeholder image URLs in the messages, and the site's own art the build swaps in for them.
const ASSETS = { "https://example.com/offer-hero.png": "../img/hero.svg" };

interface State {
  id: string;
  label: string;
  /** The preview's message: the pounce (unread, before the visitor engages), id and time filled in. */
  pounce?: Record<string, unknown>;
  /** A rep's unread follow-up after the visitor engaged, instead of a pounce. */
  repFollowUp?: string;
  /** Piper is typing the pounce: the thinking dots replace the message. */
  typing?: boolean;
  /** Voice mode: collapsed center shows the orb instead of the agent's photo. */
  voice?: boolean;
}

const pounceText = (text: string) => ({ type: "text", text, source: "auto_respond" });

const STATES: State[] = [
  { id: "text", label: "Pounce: a short message", pounce: pounceText("<p>Psst. Want to see how Llamalytics paints pipelines?</p>") },
  {
    id: "text-long",
    label: "Pounce: a long message",
    pounce: pounceText(
      "<p>Hi there! I'm Bob. I noticed you're looking at herd-level analytics. Most teams your size start with the Growth plan, and I can walk you through it in about two minutes. Want a quick tour?</p>",
    ),
  },
  {
    id: "offer",
    label: "Pounce: a shared offer",
    pounce: {
      type: "shared_offer",
      text: "<p>Here's our guide to your first happy little pipeline.</p>",
      headlineText: "The Happy Little Pipeline Guide",
      buttonUrl: "https://llamalytics.example/guides/happy-little-pipeline",
      messengerImageUrl: "https://example.com/offer-hero.png",
    },
  },
  {
    id: "offer-long",
    label: "Pounce: an offer with a long headline",
    pounce: {
      type: "shared_offer",
      text: "<p>This report covers it.</p>",
      headlineText:
        "The 2026 State of Happy Little Pipelines: How Cross-Functional Herds Paint Revenue Across the Entire Value Stream, With Benchmarks for Every Region",
      buttonUrl: "https://llamalytics.example/reports/2026/state-of-happy-little-pipelines",
      messengerImageUrl: "https://example.com/offer-hero.png",
    },
  },
  {
    id: "field-request",
    label: "Pounce: a field request's question",
    pounce: {
      type: "field_request",
      text: "<p>Before I dig in, what's your work email?</p>",
      fieldName: "email",
      fieldType: "email",
      hideText: false,
      inputFieldLabel: "Email",
      onlyShowMessage: false,
      placeholder: "",
      validateFullName: false,
    },
  },
  { id: "typing", label: "Piper typing", pounce: pounceText("<p>Psst. Want a quick tour?</p>"), typing: true },
  { id: "rep-follow-up", label: "A rep's unread follow-up", repFollowUp: "Hi, it's Annette. Did you still want that walkthrough?" },
  { id: "voice", label: "Voice mode: the orb", pounce: pounceText("<p>Want to talk it through? I'm all ears.</p>"), voice: true },
];

const LAYOUTS = [
  { id: "collapsed-right", label: "Collapsed right", displayMode: DisplayMode.COLLAPSED_RIGHT },
  { id: "collapsed-center", label: "Collapsed center", displayMode: DisplayMode.COLLAPSED_CENTER },
  { id: "closed", label: "Closed (launcher)", displayMode: DisplayMode.CLOSED },
];

const CASES = LAYOUTS.flatMap((layout) => STATES.map((state) => ({ layout, state })));

// Piper sets a team's theme as --q-* custom properties on the host (applyThemeCssVars).
const NEW_TEAM_THEME: ThemeConfig = {
  primaryColor: "#437D88",
  textColor: "#ffffff",
  buttonStyle: ButtonStyle.Outline,
  buttonShape: ButtonShape.Rectangle,
  buttonBorderRadiusPx: 4,
  buttonsUseThemeColors: true,
};
const THEMES: { id: string; label: string; theme: ThemeConfig | null }[] = [
  { id: "default", label: "New-team default (outline)", theme: NEW_TEAM_THEME },
  { id: "solid", label: "Solid buttons", theme: { ...NEW_TEAM_THEME, buttonStyle: ButtonStyle.Solid } },
  { id: "none", label: "No theme (fallbacks)", theme: null },
];

function themeVars(theme: ThemeConfig | null): Record<string, string> {
  if (!theme) return {};
  const element = document.createElement("div");
  applyThemeCssVars(element, theme);
  return Object.fromEntries(Array.from(element.style).map((name) => [name, element.style.getPropertyValue(name)]));
}

function storeFor(state: State, displayMode: DisplayMode) {
  const rootStore = createMockRootStore({ featureFlags: state.voice ? { piperXAgentVoice: true } : {} });
  const conversation = rootStore.conversations.value[0];
  rootStore.conversations.value = [
    {
      ...conversation,
      aiSdr: { avatarUrl: AI_AVATAR, name: "Bob Llama", jobTitle: "Happy Little Sales Rep" },
      ...(state.repFollowUp ? { user: { avatarUrl: REP_AVATAR, name: "Annette Alpaca", jobTitle: "Account Executive" } } : {}),
    },
  ];
  if (state.repFollowUp) rootStore.agentsAvailable.value = true;
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 25, 17, minute)).toISOString();
  const base = { conversationId: conversation.id };
  const messages: unknown[] = [{ ...base, id: "start", type: "event", eventType: "startChatBot", createdAt: at(0) }];
  if (state.pounce) {
    // Unread, from before the visitor said anything: the pounce the preview shows.
    messages.push({ ...base, id: "pounce", createdAt: at(1), isOwn: false, isRead: false, isAp: true, ...state.pounce });
  } else if (state.repFollowUp) {
    messages.push(
      { ...base, id: "pounce", type: "text", text: "<p>Psst. Want a quick tour?</p>", source: "auto_respond", isOwn: false, isRead: true, isAp: true, createdAt: at(1) },
      { ...base, id: "visitor", type: "text", text: "Maybe later.", isOwn: true, isAp: false, isRead: true, createdAt: at(2) },
      { ...base, id: "joined", type: "system", eventType: "participant_joined", isOwn: false, isRead: true, createdAt: at(3) },
      // A human rep's message (a userId, isAp false), unread, after the pounce: the follow-up the
      // preview shows (isRepTextMessage).
      { ...base, id: "follow-up", type: "text", text: state.repFollowUp, userId: "rep-1", isOwn: false, isAp: false, isRead: false, createdAt: at(4) },
    );
  }
  rootStore.messages.value = messages as typeof rootStore.messages.value;
  rootStore.setConversationMode(state.voice ? ConversationMode.VOICE : ConversationMode.TEXT);
  rootStore.setDisplayMode(displayMode);
  if (state.typing) rootStore.typingIndicatorState.value = true;
  return rootStore;
}

describe("preview static dump", () => {
  beforeAll(() => {
    setupPandaCss();
    mockVideoElement();
    fs.mkdirSync(OUT, { recursive: true });
  });

  afterEach(() => {
    mediaQueries.isMobile.value = false;
  });

  it.each(CASES)("dumps $state.label ($layout.label)", async ({ layout, state }) => {
    const rootStore = storeFor(state, layout.displayMode);
    expect(rootStore.messages.preview.visible.value).toBe(true);
    const { container, unmount } = render(
      <RootStoreContext.Provider value={rootStore}>
        <Main rootStore={rootStore} />
      </RootStoreContext.Provider>,
    );
    await waitFor(() =>
      expect(container.querySelector("[data-component-name='TimelinePreview.PreviewContent']")).not.toBeNull(),
    );
    // Let effects that set attributes after the first paint settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const composer = container.querySelector("textarea[name='chat-input']");
    if (composer && mockOverflow.fallback) composer.setAttribute("data-pasture-placeholder-fallback", mockOverflow.fallback.value);
    fs.writeFileSync(`${OUT}/${layout.id}--${state.id}.html`, container.innerHTML);
    unmount();
  });

  afterAll(() => {
    fs.writeFileSync(
      `${OUT}/states.json`,
      JSON.stringify(
        {
          layouts: LAYOUTS.map(({ id, label }) => ({ id, label })),
          states: STATES.map(({ id, label }) => ({ id, label })),
          themes: THEMES.map(({ id, label, theme }) => ({ id, label, vars: themeVars(theme) })),
          assets: ASSETS,
          placeholderFallback: "textarea[data-pasture-placeholder-fallback]",
        },
        null,
        2,
      ) + "\n",
    );
  });
});
