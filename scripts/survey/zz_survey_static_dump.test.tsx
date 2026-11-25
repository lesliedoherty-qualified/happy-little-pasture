/** @jsxImportSource preact */
// Dumps the real PiperX messenger (Main) with the post-call survey in a different state per
// capture, for site/survey.html: PostCallSurvey, the "How was the call?" rating pill and the
// "What went wrong?" feedback form the voice and video stage shows once a call ends.
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-survey.sh copies it into
// fireball's multimodal_v2/components/app/, runs it through `mise run test:js`, then deletes it,
// so fireball is never left modified. Imports are relative to that fireball location.
//
// Output (SURVEY_DUMP_DIR): one <layout>--<state>.html per layout and state, and states.json
// listing them with the theme custom properties.
//
// The stylesheet doesn't come from here: refresh-survey.sh runs `panda cssgen` itself.
import * as fs from "fs";
import { fireEvent, render, waitFor } from "@testing-library/preact";
import { RootStoreContext } from "../../stores/root_store";
import type { PostCallSurveyStore } from "../../stores/post_call_survey_store";
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

// The composer's placeholder: as on the Composer page, a stand-in for useTextOverflow (jsdom has
// no widths) returns the ideal text and remembers the fallback, which the frame measures again.
const mockOverflow: { fallback: { value: string } | null } = { fallback: null };
jest.mock("../helpers/useTextOverflow", () => ({
  useTextOverflow: (_ref: unknown, text: { value: string }, fallback: { value: string }) => {
    mockOverflow.fallback = fallback;
    return text;
  },
}));

const OUT = process.env.SURVEY_DUMP_DIR || "/tmp/survey-dump";

type Store = PostCallSurveyStore;

interface State {
  id: string;
  label: string;
  /** Voice by default; the video stage shows the survey as an overlay. */
  mode?: ConversationMode;
  /** The survey's own state, set on its store after show(). */
  setup?: (store: Store) => void;
  /** Typed into the feedback form's textarea. */
  feedback?: string;
}

const STATES: State[] = [
  { id: "rating", label: "Rating: How was the call?" },
  {
    id: "rating-up",
    label: "Rating: thumbs up picked",
    setup: (store) => {
      // As ratePositive leaves it for its 300ms before dismissing.
      store.selectedRating.value = "positive";
    },
  },
  {
    id: "rating-down",
    label: "Rating: thumbs down picked",
    setup: (store) => {
      // As rateNegative leaves it for its 300ms before the feedback form.
      store.selectedRating.value = "negative";
    },
  },
  { id: "feedback", label: "Feedback: What went wrong?", setup: (store) => (store.state.value = "feedback") },
  {
    id: "feedback-typed",
    label: "Feedback: typed",
    setup: (store) => (store.state.value = "feedback"),
    feedback: "The demo froze halfway through and Bob didn't hear my question about pricing.",
  },
  {
    id: "feedback-submit",
    label: "Feedback: Submit picked",
    setup: (store) => {
      store.state.value = "feedback";
      store.selectedFeedbackAction.value = "submit";
    },
    feedback: "The demo froze halfway through.",
  },
  {
    id: "feedback-dismiss",
    label: "Feedback: Dismiss picked",
    setup: (store) => {
      store.state.value = "feedback";
      store.selectedFeedbackAction.value = "dismiss";
    },
  },
  // No video state: there the survey overlays the bottom of the agent's video tile, and a capture's
  // <video> has no frames, so the tile collapses and the pill lands on the header. That needs a
  // stand-in for the video (with the voice and video controls page).
];

const LAYOUTS = [
  { id: "sidebar", label: "Sidebar", mobile: false },
  { id: "mobile", label: "Mobile", mobile: true },
];

const CASES = LAYOUTS.flatMap((layout) => STATES.map((state) => ({ layout, state })));

// Piper sets a team's theme as --q-* custom properties on the host (applyThemeCssVars). Submit
// and the textarea's focus border use it.
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

async function storeFor(state: State) {
  const rootStore = createMockRootStore({
    featureFlags: { piperXPostCallSurvey: true, piperXAgentVoice: true, piperXAgentVideo: true },
  });
  const conversation = rootStore.conversations.value[0];
  rootStore.conversations.value = [
    { ...conversation, aiSdr: { avatarUrl: "https://example.com/avatar.png", name: "Bob Llama", jobTitle: "Happy Little Sales Rep" } },
  ];
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 25, 17, minute)).toISOString();
  const base = { conversationId: conversation.id, isRead: true };
  // A call just ended: the transcript of a short voice exchange.
  rootStore.messages.value = [
    { ...base, id: "start", type: "event", eventType: "startChatBot", createdAt: at(0) },
    { ...base, id: "a1", type: "text", text: "<p>Hi, I'm Bob. What would you like to see?</p>", isOwn: false, isAp: true, modality: "voice", createdAt: at(1) },
    { ...base, id: "v1", type: "text", text: "Show me herd-level analytics.", isOwn: true, isAp: false, modality: "voice", createdAt: at(2) },
    { ...base, id: "a2", type: "text", text: "<p>Here's the herd view. Every pasture, one dashboard.</p>", isOwn: false, isAp: true, modality: "voice", createdAt: at(3) },
  ] as typeof rootStore.messages.value;
  // The voice and video stage (MultiModalComponent) renders nothing until the agent's preview
  // video is known: UIStore#previewVideoConfig, from initialState.previewVideoSrc. It's a private
  // signal, so set it the way UIStore#handleInitState does. The <video> stays blank in a capture.
  (rootStore.uiStore as unknown as { previewVideoSrc: { value: string | null } }).previewVideoSrc.value =
    "https://example.com/preview.mp4";
  rootStore.setConversationMode(state.mode ?? ConversationMode.VOICE);
  rootStore.setDisplayMode(DisplayMode.SIDEBAR);
  // As the call's end does (AiConversationStore): load the survey's store and show it for the
  // call. Assigning a store by hand doesn't stick: a load already under way replaces it.
  const survey: Store = await rootStore.postCallSurveyStore.load();
  survey.show("call-1");
  state.setup?.(survey);
  return { rootStore, survey };
}

const SURVEY = "[data-component-name='PostCallSurvey.RatingPrompt'], [data-component-name='PostCallSurvey.FeedbackForm']";

describe("post-call survey static dump", () => {
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
    const { rootStore, survey } = await storeFor(state);
    const { container, unmount } = render(
      <RootStoreContext.Provider value={rootStore}>
        <Main rootStore={rootStore} />
      </RootStoreContext.Provider>,
    );
    await waitFor(() => expect(container.querySelector(SURVEY)).not.toBeNull());
    if (state.feedback) {
      const box = container.querySelector<HTMLTextAreaElement>("[data-component-name='PostCallSurvey.FeedbackForm'] textarea")!;
      fireEvent.input(box, { target: { value: state.feedback } });
    }
    // Let effects that set attributes after the first paint settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    // The value is a property, which innerHTML doesn't serialize: put it in the markup.
    for (const box of container.querySelectorAll("textarea")) box.textContent = box.value;
    const composer = container.querySelector("textarea[name='chat-input']");
    if (composer && mockOverflow.fallback) composer.setAttribute("data-pasture-placeholder-fallback", mockOverflow.fallback.value);
    fs.writeFileSync(`${OUT}/${layout.id}--${state.id}.html`, container.innerHTML);
    unmount();
    survey.dismiss();
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
