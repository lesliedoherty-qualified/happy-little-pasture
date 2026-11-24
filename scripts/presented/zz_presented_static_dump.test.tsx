/** @jsxImportSource preact */
// Dumps the real PiperX messenger (Main) with a different conversation per state, for
// site/presented.html: what Piper puts in the timeline when it presents something. A deck card
// (PresentDeckRenderer), a video section card (PresentVideoRenderer) and a slide thumbnail
// (PresentContentRenderer).
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-presented.sh copies it
// into fireball's multimodal_v2/components/app/, runs it through `mise run test:js`, then deletes
// it, so fireball is never left modified. Imports are relative to that fireball location.
//
// Output (PRESENTED_DUMP_DIR): one <layout>--<state>.html per layout and conversation, and
// states.json listing them with the theme custom properties and the image placeholders.
//
// The stylesheet doesn't come from here: refresh-presented.sh runs `panda cssgen` itself.
import * as fs from "fs";
import { render, waitFor } from "@testing-library/preact";
import DecksStore from "../../stores/decks_store";
import { type RootStore, RootStoreContext } from "../../stores/root_store";
import { createMockRootStore, mockVideoElement, setupArtifactInStore, setupPandaCss } from "../../test_utils";
import {
  ButtonShape,
  ButtonStyle,
  type Conversation,
  ConversationMode,
  DisplayMode,
  type PresentDeckMessage,
  type ThemeConfig,
} from "../../types";
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

const OUT = process.env.PRESENTED_DUMP_DIR || "/tmp/presented-dump";

// Placeholder image URLs in the messages, and the site's own art the build swaps in for them,
// so the frame makes no request for them.
const SLIDES = [
  "https://example.com/slide-1.png",
  "https://example.com/slide-2.png",
  "https://example.com/slide-3.png",
];
const ASSETS = {
  [SLIDES[0]]: "../img/hero.svg",
  [SLIDES[1]]: "../img/feature-synergy.svg",
  [SLIDES[2]]: "../img/feature-roadmap.svg",
};

type Root = ReturnType<typeof createMockRootStore>;
type EmailFollowUp = NonNullable<Conversation["followUps"]>["email"];

interface State {
  id: string;
  label: string;
  /** The visitor's question, before Piper presents. */
  ask: string;
  /** What Piper presents, as a timeline message (id, conversation and time are filled in). */
  present: Record<string, unknown>;
  /** Text by default. Video cards only show where a call is possible: voice, no call yet. */
  mode?: ConversationMode;
  /** Whether a call could start (the voice flag). Off makes the conversation text-only. */
  callCapable?: boolean;
  /** Runs after the messages are in place: deck progress, follow-ups. */
  after?: (rootStore: Root, presented: PresentDeckMessage) => void;
}

const deck = (overrides: Partial<PresentDeckMessage> = {}) => ({
  type: "present_deck",
  deckId: "deck-1",
  pageId: "page-1",
  slideIndex: 0,
  imageUrl: SLIDES[0],
  slideImageUrls: SLIDES,
  pageTitle: "Overview",
  deckTitle: "The Llamalytics Pitch",
  totalSlides: 3,
  ...overrides,
});

/** Opens the deck in the viewer, steps `steps` slides forward and closes it, as a visitor would. */
function readDeck(rootStore: Root, share: PresentDeckMessage, steps: number) {
  const decks = new DecksStore(rootStore as unknown as RootStore);
  rootStore.decksStore.value = decks;
  decks.prepareSelfGuidedPlayback(share.id);
  setupArtifactInStore(rootStore, share);
  for (let i = 0; i < steps; i++) decks.goToNextSlide();
  rootStore.clearArtifact();
  // setupArtifactInStore only sets the overlay's message id, and clearArtifact doesn't reset it,
  // so the whole messenger would stay in the deck viewer's layout. The deck tests clear it the
  // same way; they render the card alone, where it doesn't show.
  rootStore.uiState.value = { ...rootStore.uiState.value, artifactMessageId: null };
}

/** The email follow-up state the server broadcasts when Piper can email the deck. */
function withEmailFollowUp(rootStore: Root, overrides: Partial<EmailFollowUp> = {}) {
  rootStore.conversations.value = [
    {
      ...rootStore.conversations.value[0],
      followUps: {
        email: { available: true, presentationAttachmentAvailable: true, request: null, ...overrides },
      },
    },
  ];
}

const STATES: State[] = [
  {
    id: "deck",
    label: "Deck: never opened",
    ask: "Can you walk me through Llamalytics?",
    present: deck({ totalSlides: 6 }),
  },
  {
    id: "deck-single",
    label: "Deck: one slide",
    ask: "Do you have a one-pager?",
    present: deck({ totalSlides: 1, slideImageUrls: [SLIDES[0]] }),
  },
  {
    id: "deck-continue",
    label: "Deck: presented, call still possible",
    ask: "Can you walk me through Llamalytics?",
    present: deck({ presentedSlideIndexes: [0, 1] }),
    callCapable: true,
  },
  {
    id: "deck-partway",
    label: "Deck: read partway",
    ask: "Can I flip through the deck myself?",
    present: deck(),
    after: (rootStore, presented) => readDeck(rootStore, presented, 1),
  },
  {
    id: "deck-watched",
    label: "Deck: watched",
    ask: "Can I flip through the deck myself?",
    present: deck(),
    after: (rootStore, presented) => readDeck(rootStore, presented, 2),
  },
  {
    id: "deck-email",
    label: "Deck: Email button",
    ask: "Can you send me the deck?",
    present: deck(),
    after: (rootStore) => withEmailFollowUp(rootStore),
  },
  {
    id: "deck-email-sent",
    label: "Deck: emailed",
    ask: "Can you send me the deck?",
    present: deck(),
    after: (rootStore) =>
      withEmailFollowUp(rootStore, {
        request: { status: "sent", email: "bob@llamalytics.com", presentationRequested: true, presentationSent: true },
      }),
  },
  {
    id: "video",
    label: "Video section (voice, before a call)",
    ask: "Can I see a demo?",
    mode: ConversationMode.VOICE,
    callCapable: true,
    present: {
      type: "present_video",
      presentationId: "demo-1",
      sectionId: "section-1",
      videoUrl: "https://example.com/demo.mp4",
      startTime: 0,
      endTime: 42,
      sectionTitle: "Painting your first pipeline",
      presentationTitle: "Llamalytics in five minutes",
    },
  },
  {
    id: "slide",
    label: "Slide thumbnail",
    ask: "What does the dashboard look like?",
    present: { type: "present_content", slideId: "7", url: SLIDES[1], slideTitle: "The herd dashboard" },
  },
];

const LAYOUTS = [
  { id: "sidebar", label: "Sidebar", mobile: false },
  { id: "mobile", label: "Mobile", mobile: true },
];

const CASES = LAYOUTS.flatMap((layout) => STATES.map((state) => ({ layout, state })));

// Piper sets a team's theme as --q-* custom properties on the host (applyThemeCssVars). The
// cards' buttons are the theme's buttons, so the theme matters here.
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
  const rootStore = createMockRootStore({ featureFlags: state.callCapable ? { piperXAgentVoice: true } : {} });
  const conversation = rootStore.conversations.value[0];
  rootStore.conversations.value = [
    { ...conversation, aiSdr: { avatarUrl: "https://example.com/avatar.png", name: "Bob Llama", jobTitle: "Happy Little Sales Rep" } },
  ];
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 24, 17, minute)).toISOString();
  const base = { conversationId: conversation.id, isRead: true };
  const presented = { ...base, id: `${state.id}-presented`, createdAt: at(2), isOwn: false, ...state.present };
  rootStore.messages.value = [
    { ...base, id: "start", type: "event", eventType: "startChatBot", createdAt: at(0) },
    { ...base, id: `${state.id}-ask`, type: "text", text: state.ask, isOwn: true, isAp: false, createdAt: at(1) },
    presented,
  ] as typeof rootStore.messages.value;
  rootStore.setConversationMode(state.mode ?? ConversationMode.TEXT);
  rootStore.setDisplayMode(DisplayMode.SIDEBAR);
  state.after?.(rootStore, presented as unknown as PresentDeckMessage);
  return rootStore;
}

const CARD = [
  "[data-component-name='PresentDeckRenderer.Shell']",
  "[data-component-name='PresentVideoRenderer.Card']",
  "[data-component-name='SlidesThumbnail.ThumbnailButton']",
].join(", ");

describe("presented content static dump", () => {
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
    const rootStore = storeFor(state);
    const { container, unmount } = render(
      <RootStoreContext.Provider value={rootStore}>
        <Main rootStore={rootStore} />
      </RootStoreContext.Provider>,
    );
    await waitFor(() => expect(container.querySelector(CARD)).not.toBeNull());
    // Let effects that set attributes after the first paint settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
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
          assets: ASSETS,
          // The video card's thumbnail is a canvas Piper paints from a frame of the video at
          // runtime, so the capture's is blank. The frame paints this picture on it instead.
          canvasStandIn: { selector: "[data-component-name='PresentVideoRenderer.Card'] canvas", src: "../img/hero.svg" },
        },
        null,
        2,
      ) + "\n",
    );
  });
});
