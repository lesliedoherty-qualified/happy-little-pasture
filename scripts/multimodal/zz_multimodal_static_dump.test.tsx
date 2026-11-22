/** @jsxImportSource preact */
// Dumps the real PiperX messenger DOM (Main) + its Panda CSS for site/multimodal.html.
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-multimodal.sh
// copies it into fireball's multimodal_v2/components/app/, runs it through
// `mise run test:js`, then deletes it, so fireball is never left modified.
// Imports are relative to that fireball location.
//
// Output (MULTIMODAL_DUMP_DIR): one <state>.html per captured state (TEXT mode in
// sidebar, docked and collapsed right, plus sidebar on a phone), and states.json
// listing them.
//
// The stylesheet doesn't come from here. Jest's Panda transformer rewrites it for
// jsdom (@layer to @media all, :where() unwrapped, :host to html), which breaks it
// inside a real shadow root, so refresh-multimodal.sh runs `panda cssgen` itself.
import * as fs from "fs";
import { render, waitFor } from "@testing-library/preact";
import { RootStoreContext } from "../../stores/root_store";
import { createMockRootStore, mockVideoElement, setupPandaCss } from "../../test_utils";
import { ConversationMode, DisplayMode } from "../../types";
import * as mediaQueries from "../../utils/media_queries";
import { Main } from "./Main";

// Same stub as the booker dump: src/validation is an .erb module rendered through Rails.
jest.mock("src/validation", () => ({
  emailRegexp: /.+@.+/,
  nameRegexp: /.*/,
  numberRegexp: /.*/,
  validateEmail: () => true,
}));

const OUT = process.env.MULTIMODAL_DUMP_DIR || "/tmp/multimodal-dump";

const NAME = "Bob Llama";
const JOB_TITLE = "Happy Little Sales Rep";

interface State {
  id: string;
  label: string;
  displayMode: DisplayMode;
  mobile: boolean;
  /** Blank renders no line, as an agent with that setting cleared does. */
  name: string;
  jobTitle: string;
  /** An unread auto-respond message, which shows as the preview card above the input. */
  preview: boolean;
}

const state = (
  id: string,
  label: string,
  displayMode: DisplayMode,
  options: Partial<Pick<State, "mobile" | "name" | "jobTitle" | "preview">> = {},
): State => ({ id, label, displayMode, mobile: false, name: NAME, jobTitle: JOB_TITLE, preview: false, ...options });

// Neither the agent's name nor its job title is required in Settings, and a cleared one stays
// blank, so the header can be name and title, name only, or only the avatar.
const STATES: State[] = [
  state("sidebar", "Sidebar", DisplayMode.SIDEBAR),
  state("docked", "Docked", DisplayMode.DOCKED),
  state("collapsed-right", "Collapsed right", DisplayMode.COLLAPSED_RIGHT),
  state("collapsed-right-preview", "Collapsed right, preview showing", DisplayMode.COLLAPSED_RIGHT, { preview: true }),
  state("mobile", "Mobile (sidebar)", DisplayMode.SIDEBAR, { mobile: true }),
  state("sidebar-no-title", "Sidebar, no job title", DisplayMode.SIDEBAR, { jobTitle: "" }),
  state("collapsed-right-no-title", "Collapsed right, no job title", DisplayMode.COLLAPSED_RIGHT, { jobTitle: "" }),
  state("sidebar-no-name", "Sidebar, no name or job title", DisplayMode.SIDEBAR, { name: "", jobTitle: "" }),
  state("collapsed-right-no-name", "Collapsed right, no name or job title", DisplayMode.COLLAPSED_RIGHT, { name: "", jobTitle: "" }),
];

function storeFor({ displayMode, name, jobTitle, preview }: State) {
  const rootStore = createMockRootStore();
  const conversation = rootStore.conversations.value[0];
  rootStore.conversations.value = [
    {
      ...conversation,
      aiSdr: {
        avatarUrl: "https://example.com/avatar.png",
        name,
        jobTitle,
      },
    },
  ];
  const at = (minutes: number) => new Date(Date.UTC(2026, 10, 19, 17, minutes)).toISOString();
  const start = {
    id: "start-event",
    type: "event" as const,
    eventType: "startChatBot" as const,
    conversationId: conversation.id,
    createdAt: at(0),
  };
  // startChatBot makes root.visible true. The preview card is the pounce: an unread agent
  // message from before the visitor has said anything, so that state has no visitor reply.
  rootStore.messages.value = (
    preview
      ? [
          start,
          {
            id: "agent-preview",
            type: "text",
            text: "Psst. Happy little pipelines grow faster with Llamalytics. Want a quick tour?",
            isOwn: false,
            isRead: false,
            source: "auto_respond",
            conversationId: conversation.id,
            createdAt: at(1),
          },
        ]
      : [
          start,
          {
            id: "agent-1",
            type: "text",
            text: "Hi there! I'm Bob. Want to see how Llamalytics turns happy little accidents into pipeline?",
            isOwn: false,
            isRead: true,
            conversationId: conversation.id,
            createdAt: at(1),
          },
          {
            id: "visitor-1",
            type: "text",
            text: "Yes please. What does it cost?",
            isOwn: true,
            conversationId: conversation.id,
            createdAt: at(2),
            isAp: false,
          },
        ]
  ) as typeof rootStore.messages.value;
  rootStore.setConversationMode(ConversationMode.TEXT);
  rootStore.setDisplayMode(displayMode);
  return rootStore;
}

describe("multimodal static dump", () => {
  beforeAll(() => {
    setupPandaCss();
    mockVideoElement();
    fs.mkdirSync(OUT, { recursive: true });
  });

  afterEach(() => {
    mediaQueries.isMobile.value = false;
  });

  it.each(STATES)("dumps Main in $label", async (state) => {
    const { id, mobile, preview } = state;
    mediaQueries.isMobile.value = mobile;
    const rootStore = storeFor(state);
    expect(rootStore.layout.root.visible.value).toBe(true);
    if (preview) expect(rootStore.messages.preview.visible.value).toBe(true);
    const { container, unmount } = render(
      <RootStoreContext.Provider value={rootStore}>
        <Main rootStore={rootStore} />
      </RootStoreContext.Provider>,
    );
    await waitFor(() => expect(container.querySelector("[part='main'], [part='toolbar']")).not.toBeNull());
    // Let effects that set attributes after the first paint settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    fs.writeFileSync(`${OUT}/${id}.html`, container.innerHTML);
    unmount();
  });

  afterAll(() => {
    fs.writeFileSync(
      `${OUT}/states.json`,
      JSON.stringify(STATES.map(({ id, label, displayMode, mobile }) => ({ id, label, displayMode, mobile })), null, 2) + "\n",
    );
  });
});
