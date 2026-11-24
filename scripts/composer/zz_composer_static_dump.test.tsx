/** @jsxImportSource preact */
// Dumps the real PiperX messenger (Main) with the composer in a different state per capture, for
// site/composer.html: ChatComposer > ChatInputForm (ComposerForm, TextArea, the send and voice
// buttons, strategy CTA buttons, the character count) and ComposerErrorBanner.
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-composer.sh copies it
// into fireball's multimodal_v2/components/app/, runs it through `mise run test:js`, then deletes
// it, so fireball is never left modified. Imports are relative to that fireball location.
//
// Output (COMPOSER_DUMP_DIR): one <layout>--<state>.html per layout and state, and states.json
// listing them with the theme custom properties.
//
// The stylesheet doesn't come from here: refresh-composer.sh runs `panda cssgen` itself.
import * as fs from "fs";
import { fireEvent, render, waitFor } from "@testing-library/preact";
import { RootStoreContext } from "../../stores/root_store";
import { createMockRootStore, mockVideoElement, setupPandaCss } from "../../test_utils";
import { ButtonShape, ButtonStyle, ConversationMode, DisplayMode, type ThemeConfig } from "../../types";
import * as mediaQueries from "../../utils/media_queries";
import { applyThemeCssVars } from "../../utils/theme_styles";
import { Main } from "./Main";
import { CHAT_INPUT_MAX_LENGTH } from "../../constants";

// Same stub as the booker dump: src/validation is an .erb module rendered through Rails.
jest.mock("src/validation", () => ({
  emailRegexp: /.+@.+/,
  nameRegexp: /.*/,
  numberRegexp: /.*/,
  validateEmail: () => [true, null],
}));

// The composer's placeholder comes from useTextOverflow: the ideal text ("Ask Bob Llama a
// question…", or the admin's) if it fits the textarea's width, else a shorter fallback. It measures
// with ResizeObserver and canvas, and jsdom has no layout, so it would always pick the fallback.
// This stand-in returns the ideal text and remembers the fallback; the dump writes the fallback on
// the textarea, and the frame repeats the hook's measurement against real layout.
const mockOverflow: { fallback: { value: string } | null } = { fallback: null };
jest.mock("../helpers/useTextOverflow", () => ({
  useTextOverflow: (_ref: unknown, text: { value: string }, fallback: { value: string }) => {
    mockOverflow.fallback = fallback;
    return text;
  },
}));

const OUT = process.env.COMPOSER_DUMP_DIR || "/tmp/composer-dump";

type Root = ReturnType<typeof createMockRootStore>;

interface State {
  id: string;
  label: string;
  /** What the visitor has typed into the composer, typed into the real textarea. */
  typed?: string;
  /** Voice mode with voice allowed: the composer gains the "Speak with" button. */
  voice?: boolean;
  /** Piper's message before the composer; a visitor reply counts as engaged and changes nothing. */
  agentText?: string;
  /** Store state the composer reads: the custom placeholder, errors, the email ask, CTAs. */
  setup?: (rootStore: Root, conversationId: string) => void;
}

const GREETING = "<p>Hi there! I'm Bob. Ask me anything about Llamalytics.</p>";

// What Piper's email ask is: an email field request the agent made, not yet answered. It isn't the
// composer's input message, so the composer stays and only switches to email mode.
const emailAsk = (conversationId: string) => ({
  id: "email-ask",
  type: "field_request",
  conversationId,
  createdAt: new Date(Date.UTC(2026, 10, 24, 17, 2)).toISOString(),
  isRead: true,
  isOwn: false,
  createdByMultimodalAgent: true,
  fieldId: "email",
  fieldName: "email",
  fieldType: "email",
  text: "<p>What's the best email for the follow-up?</p>",
  hideText: false,
  inputFieldLabel: "Email",
  onlyShowMessage: false,
  placeholder: "",
  validateFullName: false,
});

const LONG =
  "We have three regions and two CRMs that don't talk to each other.\n" +
  "Marketing lives in one, sales in the other, and the spreadsheets live everywhere.\n" +
  "Can Llamalytics bring them into one pasture without a migration project?";

const STATES: State[] = [
  { id: "empty", label: "Empty: placeholder with the agent's name", agentText: GREETING },
  {
    id: "custom-placeholder",
    label: "Empty: the admin's placeholder",
    agentText: GREETING,
    setup: (rootStore) => {
      rootStore.inputPlaceholder.value = "Ask about happy little pipelines...";
    },
  },
  { id: "typed", label: "Typed: one line", agentText: GREETING, typed: "How much does Growth cost?" },
  { id: "multiline", label: "Typed: several lines", agentText: GREETING, typed: LONG },
  {
    id: "over-limit",
    label: "Typed: over the character limit",
    agentText: GREETING,
    typed: "Happy little pipelines. ".repeat(Math.ceil((CHAT_INPUT_MAX_LENGTH + 50) / 24)),
  },
  {
    id: "send-error",
    label: "Send failed",
    agentText: GREETING,
    typed: "How much does Growth cost?",
    setup: (rootStore) => {
      rootStore.sendTextError.value = "Your message wasn't sent. Please try again.";
    },
  },
  {
    id: "email-ask",
    label: "Email ask: email mode",
    setup: (rootStore, conversationId) => {
      rootStore.messages.value = [...rootStore.messages.value, emailAsk(conversationId)] as typeof rootStore.messages.value;
    },
  },
  {
    id: "email-invalid",
    label: "Email ask: reply rejected",
    setup: (rootStore, conversationId) => {
      rootStore.messages.value = [...rootStore.messages.value, emailAsk(conversationId)] as typeof rootStore.messages.value;
      // As RootStore#sendVisitorText does for a reply that fails the email check: the banner, and
      // the rejected text, which the composer puts back in the box.
      rootStore.sendTextError.value = "Invalid email address";
      rootStore.invalidEmailReply.value = "bob@llamalytics";
    },
  },
  {
    id: "ctas",
    label: "Strategy CTA buttons",
    agentText: GREETING,
    setup: (rootStore) => {
      const conversation = rootStore.conversations.value[0];
      rootStore.conversations.value = [
        {
          ...conversation,
          aiStrategyButtonCtas: [
            { aiStrategyId: "pricing", text: "See pricing", baseText: "See pricing" },
            { aiStrategyId: "demo", text: "Book a demo", baseText: "Book a demo" },
            { aiStrategyId: "tour", text: "Take the happy little tour", baseText: "Take the happy little tour" },
          ],
        },
      ];
    },
  },
  { id: "voice", label: "Voice mode: Speak with button", agentText: GREETING, voice: true },
];

const LAYOUTS = [
  { id: "sidebar", label: "Sidebar", displayMode: DisplayMode.SIDEBAR, mobile: false },
  { id: "mobile", label: "Mobile", displayMode: DisplayMode.SIDEBAR, mobile: true },
  { id: "collapsed-right", label: "Collapsed right", displayMode: DisplayMode.COLLAPSED_RIGHT, mobile: false },
];

const CASES = LAYOUTS.flatMap((layout) => STATES.map((state) => ({ layout, state })));

// Piper sets a team's theme as --q-* custom properties on the host (applyThemeCssVars). The send
// button and the CTAs are the theme's buttons.
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
  { id: "shade", label: "Shade buttons", theme: { ...NEW_TEAM_THEME, buttonStyle: ButtonStyle.Shade } },
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
    { ...conversation, aiSdr: { avatarUrl: "https://example.com/avatar.png", name: "Bob Llama", jobTitle: "Happy Little Sales Rep" } },
  ];
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 24, 17, minute)).toISOString();
  const base = { conversationId: conversation.id, isRead: true };
  rootStore.messages.value = [
    { ...base, id: "start", type: "event", eventType: "startChatBot", createdAt: at(0) },
    ...(state.agentText ? [{ ...base, id: "greeting", type: "text", text: state.agentText, isOwn: false, isAp: true, createdAt: at(1) }] : []),
  ] as typeof rootStore.messages.value;
  rootStore.setConversationMode(state.voice ? ConversationMode.VOICE : ConversationMode.TEXT);
  rootStore.setDisplayMode(displayMode);
  state.setup?.(rootStore, conversation.id);
  return rootStore;
}

describe("composer static dump", () => {
  beforeAll(() => {
    setupPandaCss();
    mockVideoElement();
    fs.mkdirSync(OUT, { recursive: true });
  });

  afterEach(() => {
    mediaQueries.isMobile.value = false;
  });

  it.each(CASES)("dumps $state.label ($layout.label)", async ({ layout, state }) => {
    mediaQueries.isMobile.value = layout.mobile;
    const rootStore = storeFor(state, layout.displayMode);
    const { container, unmount } = render(
      <RootStoreContext.Provider value={rootStore}>
        <Main rootStore={rootStore} />
      </RootStoreContext.Provider>,
    );
    const textarea = await waitFor(() => {
      const found = container.querySelector<HTMLTextAreaElement>("textarea[name='chat-input']");
      expect(found).not.toBeNull();
      return found!;
    });
    if (state.typed) {
      // TextArea listens with onChange; fire both, as a browser does while typing.
      fireEvent.input(textarea, { target: { value: state.typed } });
      fireEvent.change(textarea, { target: { value: state.typed } });
    }
    // Let effects that set attributes after the first paint settle (the composer puts a rejected
    // email back in the box in an effect).
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (state.typed) expect(textarea.value).toBe(state.typed);
    // The value is a property, which innerHTML doesn't serialize: put it in the markup. TextArea
    // sizes itself to scrollHeight as the visitor types, which jsdom reports as 0, so drop that
    // height and mark the textarea for the frame to size the same way.
    if (mockOverflow.fallback) textarea.setAttribute("data-pasture-placeholder-fallback", mockOverflow.fallback.value);
    for (const box of container.querySelectorAll("textarea")) {
      box.textContent = box.value;
      if (box.value) {
        box.style.removeProperty("height");
        box.setAttribute("data-pasture-autosize", "");
      }
    }
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
          // Textareas the frame sizes to their content, as TextArea does on input.
          autosize: "textarea[data-pasture-autosize]",
          // Textareas whose placeholder falls back when it doesn't fit (useTextOverflow).
          placeholderFallback: "textarea[data-pasture-placeholder-fallback]",
        },
        null,
        2,
      ) + "\n",
    );
  });
});
