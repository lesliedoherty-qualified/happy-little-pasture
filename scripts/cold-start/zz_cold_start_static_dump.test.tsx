/** @jsxImportSource preact */
// Dumps the real PiperX messenger (Main) with the cold start questions in a different state per
// capture, for site/cold-start.html: ColdStartQuestions, the "Ask me things like:" suggestions
// ChatComposer shows above the composer until the visitor has sent more than three messages.
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-cold-start.sh copies it
// into fireball's multimodal_v2/components/app/, runs it through `mise run test:js`, then deletes
// it, so fireball is never left modified. Imports are relative to that fireball location.
//
// Output (COLD_START_DUMP_DIR): one <layout>--<state>.html per layout and state, and states.json
// listing them with the theme custom properties.
//
// The stylesheet doesn't come from here: refresh-cold-start.sh runs `panda cssgen` itself.
import * as fs from "fs";
import { render, waitFor } from "@testing-library/preact";
import { RootStoreContext } from "../../stores/root_store";
import { createMockRootStore, mockVideoElement, setupPandaCss } from "../../test_utils";
import { ButtonShape, ButtonStyle, ConversationMode, DisplayMode, type ThemeConfig } from "../../types";
import * as mediaQueries from "../../utils/media_queries";
import { applyThemeCssVars } from "../../utils/theme_styles";
import { resetColdStartState } from "../chat/ColdStartQuestions";
import { Main } from "./Main";

// Same stub as the booker dump: src/validation is an .erb module rendered through Rails.
jest.mock("src/validation", () => ({
  emailRegexp: /.+@.+/,
  nameRegexp: /.*/,
  numberRegexp: /.*/,
  validateEmail: () => [true, null],
}));

// The composer's placeholder: as on the Composer page, a stand-in for useTextOverflow (jsdom has
// no widths) returns the ideal text and remembers the fallback, which the frame measures again.
const mockOverflow: { fallback: { value: string } | null } = { fallback: null };
jest.mock("../helpers/useTextOverflow", () => ({
  useTextOverflow: (_ref: unknown, text: { value: string }, fallback: { value: string }) => {
    mockOverflow.fallback = fallback;
    return text;
  },
}));

const OUT = process.env.COLD_START_DUMP_DIR || "/tmp/cold-start-dump";

// ColdStartQuestions keeps what's shown, used and dismissed in module-level signals and in
// localStorage under this key (ColdStartQuestions.tsx STORAGE_KEY).
const STORAGE_KEY = "multimodal.cold_start_state.v1";

const QUESTIONS = [
  "What does Llamalytics cost?",
  "How does herd-level analytics work?",
  "Can I see a demo of Synergy Studio?",
  "Does it integrate with Salesforce?",
  "What's a happy little pipeline, anyway?",
];
const LONG_QUESTIONS = [
  "We have three regions and two CRMs. How long does a typical Llamalytics rollout take for a team like ours?",
  "Can Llamalytics replace the spreadsheets our revenue operations team maintains by hand every quarter?",
  "What does the weekly happy little report include, and who on my team can receive it?",
];
const REPLY = "<p>Good question. Here's the short version, and I can go deeper on any part.</p>";

interface State {
  id: string;
  label: string;
  questions: string[];
  /** How many the admin lets show at once (coldStartVisibleLimit, default 3). */
  limit?: number;
  /** Questions the visitor already picked: each is a visitor message and Piper's reply in the
   *  timeline, and "used" in the saved state, so the next unused ones take their places. At most
   *  three: past three visitor messages the suggestions hide. */
  picked?: string[];
  /** Strategy CTA buttons as well, which sit between the suggestions and the composer. */
  ctas?: boolean;
}

const STATES: State[] = [
  { id: "fresh", label: "Fresh: the first three", questions: QUESTIONS },
  { id: "limit-five", label: "Showing five (the admin's limit)", questions: QUESTIONS, limit: 5 },
  { id: "long", label: "Long questions", questions: LONG_QUESTIONS },
  { id: "after-pick", label: "After a pick: the next one takes its place", questions: QUESTIONS, picked: [QUESTIONS[0]] },
  {
    id: "two-left",
    label: "Three picked: the last two",
    questions: QUESTIONS,
    picked: [QUESTIONS[0], QUESTIONS[1], QUESTIONS[2]],
  },
  { id: "with-ctas", label: "With strategy CTA buttons", questions: QUESTIONS, ctas: true },
];

const LAYOUTS = [
  { id: "sidebar", label: "Sidebar", mobile: false },
  { id: "mobile", label: "Mobile", mobile: true },
];

const CASES = LAYOUTS.flatMap((layout) => STATES.map((state) => ({ layout, state })));

// Piper sets a team's theme as --q-* custom properties on the host (applyThemeCssVars). The
// suggestions' focus outline and the CTAs use it.
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

function storeFor(state: State) {
  const rootStore = createMockRootStore();
  const conversation = rootStore.conversations.value[0];
  rootStore.conversations.value = [
    {
      ...conversation,
      aiSdr: { avatarUrl: "https://example.com/avatar.png", name: "Bob Llama", jobTitle: "Happy Little Sales Rep" },
      ...(state.ctas
        ? {
            aiStrategyButtonCtas: [
              { aiStrategyId: "pricing", text: "See pricing", baseText: "See pricing" },
              { aiStrategyId: "demo", text: "Book a demo", baseText: "Book a demo" },
            ],
          }
        : {}),
    },
  ];
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 25, 17, minute)).toISOString();
  const base = { conversationId: conversation.id, isRead: true };
  const messages: unknown[] = [
    { ...base, id: "start", type: "event", eventType: "startChatBot", createdAt: at(0) },
    {
      ...base,
      id: "greeting",
      type: "text",
      text: "<p>Hi there! I'm Bob. Ask me anything about Llamalytics.</p>",
      isOwn: false,
      isAp: true,
      createdAt: at(1),
    },
  ];
  (state.picked ?? []).forEach((question, index) => {
    messages.push({ ...base, id: `pick-${index}`, type: "text", text: question, isOwn: true, isAp: false, createdAt: at(2 + index * 2) });
    messages.push({ ...base, id: `reply-${index}`, type: "text", text: REPLY, isOwn: false, isAp: true, createdAt: at(3 + index * 2) });
  });
  rootStore.messages.value = messages as typeof rootStore.messages.value;
  rootStore.coldStartQuestions.value = state.questions;
  rootStore.coldStartVisibleLimit.value = state.limit ?? 3;
  rootStore.setConversationMode(ConversationMode.TEXT);
  rootStore.setDisplayMode(DisplayMode.SIDEBAR);
  return rootStore;
}

/** What ColdStartQuestions saves after the visitor picks `picked`: those used, the rest shown. */
function savePicks(state: State) {
  localStorage.removeItem(STORAGE_KEY);
  if (!state.picked?.length) return;
  const limit = state.limit ?? 3;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      signature: JSON.stringify(state.questions),
      used: state.picked,
      displayed: state.questions.filter((q) => !state.picked!.includes(q)).slice(0, limit),
      dismissed: false,
    }),
  );
}

describe("cold start static dump", () => {
  beforeAll(() => {
    setupPandaCss();
    mockVideoElement();
    fs.mkdirSync(OUT, { recursive: true });
  });

  afterEach(() => {
    mediaQueries.isMobile.value = false;
    localStorage.removeItem(STORAGE_KEY);
  });

  it.each(CASES)("dumps $state.label ($layout.label)", async ({ layout, state }) => {
    mediaQueries.isMobile.value = layout.mobile;
    // A fresh visitor each time: the module-level state outlives a render.
    resetColdStartState();
    savePicks(state);
    const rootStore = storeFor(state);
    const { container, unmount } = render(
      <RootStoreContext.Provider value={rootStore}>
        <Main rootStore={rootStore} />
      </RootStoreContext.Provider>,
    );
    const expected = state.questions.filter((q) => !state.picked?.includes(q)).slice(0, state.limit ?? 3);
    await waitFor(() => {
      const shown = [...container.querySelectorAll("[data-component-name='ColdStartQuestions.QuestionButton']")];
      expect(shown.map((button) => button.textContent)).toEqual(expected);
    });
    // Let effects that set attributes after the first paint settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const textarea = container.querySelector("textarea[name='chat-input']");
    if (textarea && mockOverflow.fallback) textarea.setAttribute("data-pasture-placeholder-fallback", mockOverflow.fallback.value);
    fs.writeFileSync(`${OUT}/${layout.id}--${state.id}.html`, container.innerHTML);
    unmount();
  });

  afterAll(() => {
    fs.writeFileSync(
      `${OUT}/states.json`,
      JSON.stringify(
        {
          layouts: LAYOUTS,
          states: STATES.map(({ id, label }) => ({ id, label })),
          themes: THEMES.map(({ id, label, theme }) => ({ id, label, vars: themeVars(theme) })),
          placeholderFallback: "textarea[data-pasture-placeholder-fallback]",
        },
        null,
        2,
      ) + "\n",
    );
  });
});
