/** @jsxImportSource preact */
// Dumps the real PiperX messenger (Main) with a different conversation per state, for
// site/cards.html: the cards Piper puts in the timeline for a shared offer (SharedOfferRenderer)
// and shared content (ShareContentRenderer). Both are LinkPreviewCard underneath.
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-cards.sh copies it into
// fireball's multimodal_v2/components/app/, runs it through `mise run test:js`, then deletes it,
// so fireball is never left modified. Imports are relative to that fireball location.
//
// Output (CARDS_DUMP_DIR): one <layout>--<state>.html per layout and conversation, and
// states.json listing them with the theme custom properties and the image placeholders.
//
// The stylesheet doesn't come from here: refresh-cards.sh runs `panda cssgen` itself, as for the
// Messages page.
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

const OUT = process.env.CARDS_DUMP_DIR || "/tmp/cards-dump";

// Placeholder image URLs in the messages, and the site's own art the build swaps in for them,
// so the frame makes no request for them.
const ASSETS = {
  "https://example.com/offer-hero.png": "../img/hero.svg",
  "https://example.com/offer-roadmap.png": "../img/feature-roadmap.svg",
  "https://example.com/share-synergy.png": "../img/feature-synergy.svg",
  "https://example.com/share-cloud.png": "../img/feature-cloud.svg",
};

/** A message in the conversation: the visitor's text, or one of Piper's (text, offer, content). */
type Line =
  | { from: "visitor"; text: string }
  | { from: "agent"; text: string }
  | { from: "offer"; text?: string; headlineText: string; buttonUrl: string; messengerImageUrl?: string }
  | { from: "share"; url: string; title?: string; previewUrl?: string };

interface State {
  id: string;
  label: string;
  lines: Line[];
}

const STATES: State[] = [
  {
    id: "offer",
    label: "Offer: text and card with image",
    lines: [
      { from: "visitor", text: "Do you have a guide for getting started?" },
      {
        from: "offer",
        text: "<p>Here's our getting-started guide. It walks through your first happy little pipeline.</p>",
        headlineText: "The Happy Little Pipeline Guide",
        buttonUrl: "https://llamalytics.example/guides/happy-little-pipeline",
        messengerImageUrl: "https://example.com/offer-hero.png",
      },
    ],
  },
  {
    id: "offer-card-only",
    label: "Offer: card only",
    lines: [
      { from: "visitor", text: "What's on the roadmap?" },
      {
        from: "offer",
        headlineText: "Q4 roadmap webinar",
        buttonUrl: "https://llamalytics.example/webinars/q4-roadmap",
        messengerImageUrl: "https://example.com/offer-roadmap.png",
      },
    ],
  },
  {
    id: "offer-no-image",
    label: "Offer: no image",
    lines: [
      { from: "visitor", text: "Can I see pricing?" },
      {
        from: "offer",
        text: "<p>Here's the pricing page.</p>",
        headlineText: "Plans that scale with your herd",
        buttonUrl: "https://llamalytics.example/pricing",
      },
    ],
  },
  {
    id: "offer-long",
    label: "Offer: long headline and URL",
    lines: [
      { from: "visitor", text: "Is there a report on this?" },
      {
        from: "offer",
        headlineText:
          "The 2026 State of Happy Little Pipelines: How Cross-Functional Herds Paint Revenue Across the Entire Value Stream",
        buttonUrl:
          "https://llamalytics.example/reports/2026/state-of-happy-little-pipelines/cross-functional-herds?utm_source=piper",
        messengerImageUrl: "https://example.com/offer-hero.png",
      },
    ],
  },
  {
    id: "share",
    label: "Shared content: preview and title",
    lines: [
      { from: "visitor", text: "How does Synergy Studio work?" },
      { from: "agent", text: "<p>This page has the overview.</p>" },
      {
        from: "share",
        url: "https://llamalytics.example/platform/synergy-studio",
        title: "Synergy Studio: ideate, align and circle back",
        previewUrl: "https://example.com/share-synergy.png",
      },
    ],
  },
  {
    id: "share-long-title",
    label: "Shared content: long title (one line)",
    lines: [
      { from: "visitor", text: "Tell me about the pasture." },
      {
        from: "share",
        url: "https://llamalytics.example/platform/cloud-native-pasture",
        title:
          "Cloud-Native Pasture: a serverless, zero-trust, best-of-breed grazing layer that scales elastically with your herd",
        previewUrl: "https://example.com/share-cloud.png",
      },
    ],
  },
  {
    id: "share-no-preview",
    label: "Shared content: no preview image",
    lines: [
      { from: "visitor", text: "Where are the docs?" },
      { from: "share", url: "https://docs.llamalytics.example/", title: "Llamalytics docs" },
    ],
  },
];

const LAYOUTS = [
  { id: "sidebar", label: "Sidebar", mobile: false },
  { id: "mobile", label: "Mobile", mobile: true },
];

const CASES = LAYOUTS.flatMap((layout) => STATES.map((state) => ({ layout, state })));

// Piper sets a team's theme as --q-* custom properties on the host (applyThemeCssVars). The
// card headline is the primary colour, so the theme matters here.
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
    { ...conversation, aiSdr: { avatarUrl: "https://example.com/avatar.png", name: "Bob Llama", jobTitle: "Happy Little Sales Rep" } },
  ];
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 24, 17, minute)).toISOString();
  const messages: unknown[] = [
    { id: "start", type: "event", eventType: "startChatBot", conversationId: conversation.id, createdAt: at(0) },
  ];
  state.lines.forEach((line, index) => {
    // Read, so text shows whole and the offer card isn't hidden: it waits for its message to be
    // read before it shows.
    const base = { id: `${state.id}-${index}`, conversationId: conversation.id, createdAt: at(index + 1), isRead: true };
    if (line.from === "visitor") messages.push({ ...base, type: "text", text: line.text, isOwn: true, isAp: false });
    else if (line.from === "agent") messages.push({ ...base, type: "text", text: line.text, isOwn: false, isAp: true });
    else if (line.from === "offer") {
      const { from: _from, ...offer } = line;
      messages.push({ ...base, type: "shared_offer", isOwn: false, ...offer });
    } else {
      const { from: _from, ...share } = line;
      messages.push({ ...base, type: "share_content", isOwn: false, ...share });
    }
  });
  rootStore.messages.value = messages as typeof rootStore.messages.value;
  rootStore.setConversationMode(ConversationMode.TEXT);
  rootStore.setDisplayMode(DisplayMode.SIDEBAR);
  return rootStore;
}

const CARD = "[data-component-name='SharedOfferRenderer.OfferContainer'], [data-component-name='ShareContentRenderer.CardContainer']";

describe("cards static dump", () => {
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
    const cards = state.lines.filter((line) => line.from === "offer" || line.from === "share").length;
    await waitFor(() => expect(container.querySelectorAll(CARD).length).toBe(cards));
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
        },
        null,
        2,
      ) + "\n",
    );
  });
});
