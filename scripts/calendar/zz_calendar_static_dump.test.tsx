/** @jsxImportSource preact */
// Dumps the real PiperX messenger (Main) with a different conversation per state, for
// site/calendar.html: the meeting booker's entries in the chat timeline. The offer's "Continue
// booking" card (CalendarEventOfferRenderer > MeetingBookerEntry), the cancelled offer, and the
// booked meeting (CalendarEventPickRenderer > MeetingDetailsCard). The booker itself opens in the
// overlay and has its own page (components.html).
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-calendar.sh copies it
// into fireball's multimodal_v2/components/app/, runs it through `mise run test:js`, then deletes
// it, so fireball is never left modified. Imports are relative to that fireball location.
//
// Output (CALENDAR_DUMP_DIR): one <layout>--<state>.html per layout and conversation, and
// states.json listing them with the theme custom properties.
//
// The stylesheet doesn't come from here: refresh-calendar.sh runs `panda cssgen` itself.
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

const OUT = process.env.CALENDAR_DUMP_DIR || "/tmp/calendar-dump";

const AI_AVATAR = "https://example.com/avatar.png";
const REP_AVATAR = "https://example.com/rep.png";
const REP = { id: "rep-1", name: "Annette Alpaca" };

// A meeting on Tuesday 1 December 2026 at 10:30 in New York (15:30 UTC), for 30 minutes.
const STARTS_AT = "2026-12-01T15:30:00Z";
const ENDS_AT = "2026-12-01T16:00:00Z";

interface State {
  id: string;
  label: string;
  ask: string;
  /** What Piper puts in the timeline, as a message (id, conversation and time are filled in). */
  entry: Record<string, unknown>;
  /** A rep in the conversation: with a scripted offer, that cancels it. */
  rep?: boolean;
}

const offer = (overrides: Record<string, unknown> = {}) => ({
  type: "calendar_event_offer",
  calendarEventTypeId: "intro-30",
  calendarEventTypeName: "Intro call",
  calendarEventTypeDuration: 1800,
  timeZone: "America/New_York",
  availableSlots: [],
  users: [{ ...REP, avatarUrl: REP_AVATAR }],
  ...overrides,
});

const pick = (user: Record<string, unknown> | null, timeZone = "America/New_York") => ({
  type: "calendar_event_pick",
  replyToId: "offer-1",
  calendarEventStartsAt: STARTS_AT,
  selectedTimeZone: timeZone,
  calendarEventInviteEmail: "bob@llamalytics.com",
  calendarEvent: {
    id: "event-1",
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    email: "bob@llamalytics.com",
    timeZone,
    ...(user ? { user } : {}),
  },
});

const STATES: State[] = [
  {
    id: "offer",
    label: "Offer: Continue booking",
    ask: "Can I book a demo?",
    entry: offer(),
  },
  {
    id: "offer-cancelled",
    label: "Offer: cancelled (a rep joined)",
    ask: "Can I book a demo?",
    rep: true,
    entry: offer({ scriptId: "script-1" }),
  },
  {
    id: "pick",
    label: "Booked: with a rep",
    ask: "Tuesday at 10:30 works.",
    entry: pick({ ...REP, avatarUrl: REP_AVATAR }),
  },
  {
    id: "pick-unnamed",
    label: "Booked: no rep name or avatar",
    ask: "Tuesday at 10:30 works.",
    entry: pick(null),
  },
  {
    id: "pick-tokyo",
    label: "Booked: visitor in Tokyo",
    ask: "The Wednesday morning slot works for me.",
    entry: pick({ ...REP, avatarUrl: REP_AVATAR }, "Asia/Tokyo"),
  },
];

const LAYOUTS = [
  { id: "sidebar", label: "Sidebar", mobile: false },
  { id: "mobile", label: "Mobile", mobile: true },
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

function storeFor(state: State) {
  const rootStore = createMockRootStore();
  const conversation = rootStore.conversations.value[0];
  rootStore.conversations.value = [
    {
      ...conversation,
      aiSdr: { avatarUrl: AI_AVATAR, name: "Bob Llama", jobTitle: "Happy Little Sales Rep" },
      ...(state.rep ? { user: { avatarUrl: REP_AVATAR, name: REP.name, jobTitle: "Account Executive" } } : {}),
    },
  ];
  // A rep chatting live means reps are available; the mock leaves this off, which would swap the
  // composer for the offline notice.
  if (state.rep) rootStore.agentsAvailable.value = true;
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 24, 17, minute)).toISOString();
  const base = { conversationId: conversation.id, isRead: true };
  rootStore.messages.value = [
    { ...base, id: "start", type: "event", eventType: "startChatBot", createdAt: at(0) },
    { ...base, id: `${state.id}-ask`, type: "text", text: state.ask, isOwn: true, isAp: false, createdAt: at(1) },
    { ...base, id: "offer-1", createdAt: at(2), isOwn: false, ...state.entry },
  ] as typeof rootStore.messages.value;
  rootStore.setConversationMode(ConversationMode.TEXT);
  rootStore.setDisplayMode(DisplayMode.SIDEBAR);
  return rootStore;
}

const ENTRY = [
  "[data-component-name='MeetingBookerEntry.CardButton']",
  "[data-component-name='CalendarEventOfferRenderer.CancelledCard']",
  "[data-component-name='CalendarEventPickRenderer.Card']",
].join(", ");

describe("calendar static dump", () => {
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
    await waitFor(() => expect(container.querySelector(ENTRY)).not.toBeNull());
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
        },
        null,
        2,
      ) + "\n",
    );
  });
});
