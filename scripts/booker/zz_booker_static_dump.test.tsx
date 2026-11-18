/** @jsxImportSource preact */
// Dumps the real PiperX meeting booker DOM + its Panda CSS for site/booker.html.
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-booker.sh
// copies it into fireball's multimodal_v2/components/meetings/, runs it through
// `mise run test:js`, then deletes it, so fireball is never left modified.
// Imports are relative to that fireball location.
//
// Output (BOOKER_DUMP_DIR): panda.css; shipped-mobile.html and
// shipped-desktop.html (the lightbox as the checkout renders it with isMobile
// on and off); fixed.html (the desktop lightbox with the "small" mobile layout
// swapped in, a preview of the layout fix for a checkout that lacks it);
// slot-classes.json.
import * as fs from "fs";
import { render, waitFor } from "@testing-library/preact";
import pandaCss from "../../index.panda.css";
import { LightboxExperience } from "../app/LightboxExperience";
import {
  createMockCalendarEventOfferMessage,
  createMockRootStore,
  initializeMeetingOffer,
  setupPandaCss,
} from "../../test_utils";
import * as mediaQueries from "../../utils/media_queries";
import { MeetingTimeSelector } from "./MeetingTimeSelector";

// The local Rails boot (restate-sdk native bundle) is broken, and src/validation is
// an .erb module rendered through Rails. Stub it; the dump never validates email.
jest.mock("src/validation", () => ({
  emailRegexp: /.+@.+/,
  nameRegexp: /.*/,
  numberRegexp: /.*/,
  validateEmail: () => true,
}));

const OUT =process.env.BOOKER_DUMP_DIR || "/tmp/booker-dump";

// 15-minute slots, 9:00–11:45 America/Denver (UTC-7) on Thu 2026-11-19, plus a
// few on Fri, like the QAI-6749 screenshot ("9:00 AM", "9:15 AM").
function slots() {
  const out: { startsAt: string; endsAt: string }[] = [];
  for (const day of ["2026-11-19", "2026-11-20"]) {
    for (let m = 0; m < 12 * 15; m += 15) {
      const h = 16 + Math.floor(m / 60);
      const mm = String(m % 60).padStart(2, "0");
      const start = `${day}T${String(h).padStart(2, "0")}:${mm}:00Z`;
      const end = new Date(new Date(start).getTime() + 15 * 60000).toISOString();
      out.push({ startsAt: start, endsAt: end });
    }
  }
  return out;
}

function offer() {
  return createMockCalendarEventOfferMessage({
    availableSlots: slots(),
    timeZone: "America/Denver",
    calendarEventTypeDuration: 900,
  });
}

describe("booker static dump", () => {
  beforeAll(() => {
    setupPandaCss();
    fs.mkdirSync(OUT, { recursive: true });
    // @ts-expect-error transformer exports { css, cssMap }
    fs.writeFileSync(`${OUT}/panda.css`, pandaCss.css);
  });

  // Renders the full lightbox booker and waits for its time grid. The markup is
  // read before anything flips isMobile again: the layout is a signal, so a later
  // flip would re-render it.
  async function renderLightbox() {
    const rootStore = createMockRootStore();
    rootStore.elementConversationOffer.value = offer();
    const lightbox = render(<LightboxExperience rootStore={rootStore} />);
    try {
      await waitFor(
        () => {
          expect(
            lightbox.container.querySelector(
              '[data-component-name="MeetingTimeSelector.SlotsSection"]',
            ),
          ).not.toBeNull();
        },
        { timeout: 8000 },
      );
    } catch (error) {
      // Leave what did render behind, to see why the booker never reached the grid.
      fs.writeFileSync(`${OUT}/debug-lightbox.html`, lightbox.container.innerHTML);
      throw error;
    }
    return lightbox;
  }

  it("dumps the lightbox booker on mobile and desktop, and with the small layout swapped in", async () => {
    const SECTIONS = ["WeekViewSection", "SlotsSection"];

    // Mobile viewport. The small-layout selector (artifact + isMobile) gives the
    // sections the layout fix renders, cloned now, before the flip back below.
    mediaQueries.isMobile.value = true;
    const smallRoot = createMockRootStore();
    initializeMeetingOffer(smallRoot, offer());
    const small = render(
      <MeetingTimeSelector
        meetingStore={smallRoot.meetingStore.value!}
        bookerResultDetail="slots"
        t={smallRoot.translationStore.t}
        context="artifact"
      />,
    );
    const smallSections = SECTIONS.map((name) => {
      const section = small.container.querySelector(
        `[data-component-name="MeetingTimeSelector.${name}"]`,
      );
      expect(section).not.toBeNull();
      return section!.cloneNode(true);
    });
    expect(
      small.container.querySelector('[data-component-name="MeetingTimeSelector.WeekViewTopRow"]'),
    ).not.toBeNull();

    // The lightbox as this fireball checkout renders it on a phone.
    const mobile = await renderLightbox();
    const shippedMobile = mobile.container.innerHTML;
    small.unmount();
    mobile.unmount();

    // Desktop viewport: the lightbox as this checkout renders it there.
    mediaQueries.isMobile.value = false;
    const desktop = await renderLightbox();
    const shippedDesktop = desktop.container.innerHTML;

    // The desktop lightbox with the small sections swapped in: a preview of the
    // layout fix that works against a checkout that doesn't have it yet.
    const live = desktop.container;
    SECTIONS.forEach((name, index) => {
      const target = live.querySelector(`[data-component-name="MeetingTimeSelector.${name}"]`);
      expect(target).not.toBeNull();
      target!.replaceWith(smallSections[index]);
    });
    const fixed = live.innerHTML;

    // Selected vs unselected SlotButton classes, so the page can toggle selection.
    const buttons = Array.from(
      live.querySelectorAll('[data-component-name="MeetingTimeSelector.SlotButton"]'),
    );
    const selected = buttons.find((b) => b.getAttribute("aria-pressed") === "true");
    const unselected = buttons.find((b) => b.getAttribute("aria-pressed") !== "true");

    fs.writeFileSync(`${OUT}/shipped-mobile.html`, shippedMobile);
    fs.writeFileSync(`${OUT}/shipped-desktop.html`, shippedDesktop);
    fs.writeFileSync(`${OUT}/fixed.html`, fixed);
    fs.writeFileSync(
      `${OUT}/slot-classes.json`,
      JSON.stringify(
        { selected: selected?.className ?? null, unselected: unselected?.className ?? null },
        null,
        2,
      ),
    );
    mediaQueries.isMobile.value = false;
  });
});
