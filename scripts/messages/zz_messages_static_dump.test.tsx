/** @jsxImportSource preact */
// Dumps the real PiperX messenger (Main) with a different conversation per state, for
// site/messages.html: message bubbles, rich text, the rep-joined line and the thinking indicator.
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-messages.sh copies it
// into fireball's multimodal_v2/components/app/, runs it through `mise run test:js`, then deletes
// it, so fireball is never left modified. Imports are relative to that fireball location.
//
// Output (MESSAGES_DUMP_DIR): one <layout>--<state>.html per layout and conversation, and
// states.json listing them with the theme custom properties.
//
// The stylesheet doesn't come from here. Jest's Panda transformer rewrites it for jsdom
// (@layer to @media all, :where() unwrapped, :host to html), which breaks it inside a real
// shadow root, so refresh-messages.sh runs `panda cssgen` itself.
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

const OUT = process.env.MESSAGES_DUMP_DIR || "/tmp/messages-dump";

// The build swaps these for local portraits, so the frame makes no request for them.
const AI_AVATAR = "https://example.com/avatar.png";
const REP_AVATAR = "https://example.com/rep.png";

type Message = ReturnType<typeof createMockRootStore>["messages"]["value"][number];

interface Line {
  /** agent: Piper or the rep, as HTML (the server renders markdown). visitor: plain text. */
  from: "agent" | "visitor" | "joined";
  text?: string;
}

interface State {
  id: string;
  label: string;
  lines: Line[];
  /** A sales rep has joined the conversation: the joined line needs the conversation's user. */
  rep?: boolean;
  /** Whether reps are available (server state). With a rep in the conversation and none
   *  available, the composer gives way to the offline notice. */
  repsOnline?: boolean;
  /** Piper is working on a reply: the thinking indicator under the last message. */
  thinking?: boolean;
  /** How long to let the capture settle. ThinkingAnimation shows its label after 1s. */
  settleMs?: number;
}

const agent = (text: string): Line => ({ from: "agent", text });
const visitor = (text: string): Line => ({ from: "visitor", text });

const THINKING_LINES: Line[] = [
  agent("<p>Hi there! I'm Bob. Ask me anything about Llamalytics.</p>"),
  visitor("How does the herd-level analytics work?"),
];

const STATES: State[] = [
  {
    id: "short",
    label: "Short exchange",
    lines: [
      agent("<p>Hi there! I'm Bob. Want to see how Llamalytics turns happy little accidents into pipeline?</p>"),
      visitor("Yes please. What does it cost?"),
      agent("<p>Plans start at $49 a month per herd. Most teams start on <strong>Growth</strong>.</p>"),
    ],
  },
  {
    id: "rich-text",
    label: "Rich text: paragraphs, bold, links, lists",
    lines: [
      visitor("What do I get on Growth?"),
      agent(
        "<p>Here's what's in <strong>Growth</strong>:</p>" +
          "<ul><li>Unlimited pastures</li><li>Herd-level analytics</li><li>A weekly happy little report</li></ul>" +
          "<p>Getting started takes three steps:</p>" +
          "<ol><li>Connect your CRM</li><li>Invite your herd</li><li>Paint your first pipeline</li></ol>" +
          '<p>See the <a href="/pricing">pricing page</a> for details, or read the ' +
          '<a href="https://example.org/llama-review">independent review</a>.</p>',
      ),
    ],
  },
  {
    id: "table",
    label: "Table",
    lines: [
      visitor("Can you compare the plans?"),
      agent(
        "<p>Here's how the plans compare:</p>" +
          "<table><thead><tr><th>Plan</th><th>Seats</th><th>Price</th></tr></thead><tbody>" +
          "<tr><td>Starter</td><td>Up to 5</td><td>$49/mo</td></tr>" +
          "<tr><td>Growth</td><td>Up to 50</td><td>$199/mo</td></tr>" +
          "<tr><td>Herd</td><td>Unlimited</td><td>Talk to us</td></tr>" +
          "</tbody></table>",
      ),
    ],
  },
  {
    id: "long",
    label: "Long and unbroken text",
    lines: [
      visitor(
        "We have a pretty complicated setup: three regions, two CRMs that don't talk to each other, and a pasture of spreadsheets nobody wants to own. Can Llamalytics untangle that, or do we need to clean it up first?",
      ),
      agent(
        "<p>No cleanup first. Here's the long link our setup guide lives at, for the record:</p>" +
          "<p>https://docs.llamalytics.example/setup/multi-region/crm-consolidation/spreadsheets-are-happy-little-accidents-too</p>",
      ),
      visitor("supercalifragilisticexpialidociouspipelineswithoutanyspacesatall"),
    ],
  },
  {
    id: "rep-joined",
    label: "A sales rep joins",
    rep: true,
    repsOnline: true,
    lines: [
      visitor("Can I talk to a person?"),
      agent("<p>Of course. Let me bring in someone from the team.</p>"),
      { from: "joined" },
      agent("<p>Hi, I'm Annette. Happy to help. What are you hoping to sort out?</p>"),
    ],
  },
  {
    id: "reps-offline",
    label: "Reps offline",
    rep: true,
    lines: [
      visitor("Can I talk to a person?"),
      agent("<p>Of course. Let me bring in someone from the team.</p>"),
      { from: "joined" },
      agent("<p>Hi, I'm Annette. I'm heading out for the day, but I'll follow up by email.</p>"),
    ],
  },
  {
    id: "thinking",
    label: "Piper thinking (first second)",
    thinking: true,
    lines: THINKING_LINES,
  },
  {
    id: "thinking-label",
    label: "Piper thinking, label showing",
    thinking: true,
    settleMs: 1100,
    lines: THINKING_LINES,
  },
];

const LAYOUTS = [
  { id: "sidebar", label: "Sidebar", mobile: false },
  { id: "mobile", label: "Mobile", mobile: true },
];

const CASES = LAYOUTS.flatMap((layout) => STATES.map((state) => ({ layout, state })));

// Piper sets a team's theme as --q-* custom properties on the host (applyThemeCssVars). The
// default is Team::Themes' new-team theme: #437D88, white text, outline rectangle buttons.
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
      ...(state.rep ? { user: { avatarUrl: REP_AVATAR, name: "Annette Alpaca", jobTitle: "Account Executive" } } : {}),
    },
  ];
  // Today, so the joined line reads "Today, <time>" as it does live.
  const at = (minute: number) => {
    const date = new Date();
    date.setHours(14, minute, 0, 0);
    return date.toISOString();
  };
  const messages: unknown[] = [
    { id: "start", type: "event", eventType: "startChatBot", conversationId: conversation.id, createdAt: at(0) },
  ];
  state.lines.forEach((line, index) => {
    const base = { id: `${state.id}-${index}`, conversationId: conversation.id, createdAt: at(index + 1) };
    if (line.from === "joined") {
      messages.push({ ...base, type: "system", eventType: "participant_joined", isOwn: false });
    } else if (line.from === "visitor") {
      messages.push({ ...base, type: "text", text: line.text, isOwn: true, isAp: false });
    } else {
      // Read, so RichText shows it whole instead of fading it in word by word.
      messages.push({ ...base, type: "text", text: line.text, isOwn: false, isRead: true, isAp: !state.rep || index < 2 });
    }
  });
  rootStore.messages.value = messages as Message[];
  rootStore.setConversationMode(ConversationMode.TEXT);
  rootStore.setDisplayMode(DisplayMode.SIDEBAR);
  rootStore.agentsAvailable.value = !!state.repsOnline;
  if (state.thinking) rootStore.typingIndicatorState.value = true;
  return rootStore;
}

describe("messages static dump", () => {
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
    expect(rootStore.layout.root.visible.value).toBe(true);
    const { container, unmount } = render(
      <RootStoreContext.Provider value={rootStore}>
        <Main rootStore={rootStore} />
      </RootStoreContext.Provider>,
    );
    const expected = state.lines.filter((line) => line.from !== "joined").length;
    await waitFor(() =>
      expect(container.querySelectorAll("[data-component-name='MessageEntry.Container']").length).toBe(expected),
    );
    if (state.rep) {
      await waitFor(() =>
        expect(container.querySelector("[data-component-name='SystemRenderer.SystemMessageContainer']")).not.toBeNull(),
      );
    }
    // Let effects that set attributes after the first paint settle.
    await new Promise((resolve) => setTimeout(resolve, state.settleMs ?? 50));
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
