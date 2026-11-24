/** @jsxImportSource preact */
// Dumps the real PiperX field request (FieldRequest) DOM for site/form-fields.html.
//
// This file lives in happy-little-pasture, not fireball. scripts/refresh-form-fields.sh
// copies it into fireball's multimodal_v2/components/field_request/, runs it through
// `mise run test:js`, then deletes it, so fireball is never left modified.
// Imports are relative to that fireball location.
//
// Output (FORM_FIELDS_DUMP_DIR): one <mode>--<state>.html per display mode and field state,
// and states.json listing both.
//
// The stylesheet doesn't come from here. Jest's Panda transformer rewrites it for jsdom
// (@layer to @media all, :where() unwrapped, :host to html), which breaks it inside a real
// shadow root, so refresh-form-fields.sh runs `panda cssgen` itself.
import * as fs from "fs";
import { signal } from "@preact/signals";
import { render, waitFor } from "@testing-library/preact";
import { RootStoreContext } from "../../stores/root_store";
import { createMockRootStore, setupPandaCss } from "../../test_utils";
import { ButtonShape, ButtonStyle, DisplayMode, type RenderedMessage, type ThemeConfig } from "../../types";
import { applyThemeCssVars } from "../../utils/theme_styles";
import { FieldRequestRenderer } from "../chat/timeline/FieldRequestRenderer";
import FieldRequest from "./index";

// src/validation is an .erb module rendered through Rails. This stand-in is just enough to
// reach each error the store shows: no dot after the @ is invalid, and gmail.com is personal.
jest.mock("src/validation", () => ({
  emailRegexp: /.+@.+/,
  nameRegexp: /.*/,
  numberRegexp: /.*/,
  validateEmail: (email: string, checkDomain?: boolean) => {
    const domain = email.split("@")[1] ?? "";
    if (!domain.includes(".")) return [false, "invalid"];
    if (checkDomain && domain === "gmail.com") return [false, "personal"];
    return [true, null];
  },
}));

const OUT = process.env.FORM_FIELDS_DUMP_DIR || "/tmp/form-fields-dump";

type FieldMessage = RenderedMessage & { type: "field_request" };
type FieldType = FieldMessage["fieldType"];

interface FieldState {
  id: string;
  label: string;
  fieldType: FieldType;
  /** What the agent asked. Shows above the field only in the collapsed modes. */
  text: string;
  value?: string;
  selected?: string[];
  submitError?: string;
  message?: Partial<FieldMessage>;
}

const PLANS = [
  { label: "Starter", value: "starter" },
  { label: "Growth", value: "growth" },
  { label: "Herd (enterprise)", value: "herd" },
];
const TOPICS = [
  { label: "Pricing", value: "pricing" },
  { label: "Integrations", value: "integrations" },
  { label: "Security review", value: "security" },
  { label: "A happy little demo", value: "demo" },
];

const FIELDS: FieldState[] = [
  { id: "name-empty", label: "Name, empty", fieldType: "name", text: "What's your name?" },
  {
    id: "name-full-name-error",
    label: "Name, full name required",
    fieldType: "name",
    text: "What's your full name?",
    value: "Bob",
    message: { validateFullName: true },
  },
  { id: "email-empty", label: "Email, empty", fieldType: "email", text: "What's your work email?" },
  {
    id: "email-filled",
    label: "Email, valid",
    fieldType: "email",
    text: "What's your work email?",
    value: "bob@llamalytics.com",
  },
  {
    id: "email-invalid",
    label: "Email, invalid",
    fieldType: "email",
    text: "What's your work email?",
    value: "bob@llamalytics",
  },
  {
    id: "email-personal",
    label: "Email, business domain required",
    fieldType: "email",
    text: "What's your work email?",
    value: "bob@gmail.com",
    message: { validateEmailDomain: true },
  },
  {
    id: "email-submit-error",
    label: "Email, submit failed",
    fieldType: "email",
    text: "What's your work email?",
    value: "bob@llamalytics.com",
    submitError: "Failed to submit. Please try again.",
  },
  {
    id: "company-filled",
    label: "Company, filled",
    fieldType: "company",
    text: "Where do you work?",
    value: "Happy Little Pasture Co.",
  },
  {
    id: "phone-invalid",
    label: "Phone, invalid",
    fieldType: "phone",
    text: "What's the best number to reach you?",
    value: "555-01",
  },
  { id: "decimal-filled", label: "Number, filled", fieldType: "decimal", text: "How many llamas on your team?", value: "42" },
  {
    id: "string-placeholder",
    label: "Short answer, custom placeholder",
    fieldType: "string",
    text: "What brings you to Llamalytics today?",
    message: { placeholder: "A sentence or two is plenty" },
  },
  {
    id: "text-filled",
    label: "Long answer, filled",
    fieldType: "text",
    text: "Anything else we should know?",
    value: "We're moving off spreadsheets this quarter.\nThe herd is growing faster than the pasture.",
    message: { inputFieldLabel: "Anything else" },
  },
  {
    id: "picklist-empty",
    label: "Picklist, nothing picked",
    fieldType: "picklist",
    text: "Which plan are you looking at?",
    message: { fieldValues: PLANS, inputFieldLabel: "Plan" },
  },
  // No "picked" picklist state: a chip click submits at once and the field goes away.
  {
    id: "picklist-stacked",
    label: "Picklist, stacked",
    fieldType: "picklist",
    text: "Which plan are you looking at?",
    message: { fieldValues: PLANS, inputFieldLabel: "Plan", layout: { stacked: true } },
  },
  {
    id: "picklist-stacked-expanded",
    label: "Picklist, stacked full width",
    fieldType: "picklist",
    text: "Which plan are you looking at?",
    message: { fieldValues: PLANS, inputFieldLabel: "Plan", layout: { stacked: true, expand: true } },
  },
  {
    id: "multi-picklist-empty",
    label: "Multi-picklist, nothing picked",
    fieldType: "multi_picklist",
    text: "What do you want to cover?",
    message: { fieldValues: TOPICS, inputFieldLabel: "Topics" },
  },
  {
    id: "multi-picklist-picked",
    label: "Multi-picklist, two picked",
    fieldType: "multi_picklist",
    text: "What do you want to cover?",
    selected: ["pricing", "demo"],
    message: { fieldValues: TOPICS, inputFieldLabel: "Topics" },
  },
  {
    id: "boolean-unchecked",
    label: "Checkbox, unchecked",
    fieldType: "boolean",
    text: "Can we send you the Happy Little Newsletter?",
    message: { inputFieldLabel: "Yes, send me the newsletter" },
  },
  {
    id: "boolean-checked",
    label: "Checkbox, checked",
    fieldType: "boolean",
    text: "Can we send you the Happy Little Newsletter?",
    value: "true",
    message: { inputFieldLabel: "Yes, send me the newsletter" },
  },
];

const MODES = [
  // Docked isn't captured: its field styles match Sidebar's except Sidebar's extra
  // marginInline: $xl on the field request container.
  { id: "sidebar", label: "Sidebar (same as docked)", displayMode: DisplayMode.SIDEBAR },
  { id: "collapsed-right", label: "Collapsed right", displayMode: DisplayMode.COLLAPSED_RIGHT },
];

const CASES = MODES.flatMap((mode) => FIELDS.map((field) => ({ mode, field })));

/** `<mode>--<field>` for each capture taken from the timeline instead of the input area. */
const anchoredCases = new Set<string>();

// Piper sets a team's theme as --q-* custom properties on the host (applyThemeCssVars, the
// split-CSS path). Without one, the stylesheet's fallbacks apply: production renders that way
// until a theme arrives, and a theme may never come. The default is Team::Themes' new-team
// theme: #437D88, white text, outline rectangle buttons with a 4px radius, theme colors on.
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

/** The custom properties applyThemeCssVars sets for a theme, read back off an element. */
function themeVars(theme: ThemeConfig | null): Record<string, string> {
  if (!theme) return {};
  const element = document.createElement("div");
  applyThemeCssVars(element, theme);
  return Object.fromEntries(
    Array.from(element.style).map((name) => [name, element.style.getPropertyValue(name)]),
  );
}

function messageFor(field: FieldState): FieldMessage {
  return {
    id: `field-${field.id}`,
    type: "field_request",
    conversationId: "conv-1",
    createdAt: new Date(Date.UTC(2026, 10, 24, 17, 0)).toISOString(),
    fieldName: field.fieldType,
    fieldType: field.fieldType,
    hideText: false,
    inputFieldLabel: "",
    isOwn: false,
    // Read, so the timeline shows the question whole instead of typing it out (RichText
    // animates unread agent text, and the capture would catch it part-way).
    isRead: true,
    onlyShowMessage: false,
    placeholder: "",
    text: field.text,
    validateFullName: false,
    ...field.message,
  } as FieldMessage;
}

describe("form fields static dump", () => {
  beforeAll(() => {
    setupPandaCss();
    fs.mkdirSync(OUT, { recursive: true });
  });

  it.each(CASES)("dumps $field.label in $mode.label", async ({ mode, field }) => {
    const rootStore = createMockRootStore();
    rootStore.setDisplayMode(mode.displayMode);
    const message = messageFor(field);
    // As FieldRequest's own tests do: the message is the input message, and the store's
    // active message is pinned to it.
    rootStore.messages.value = [message];
    rootStore.uiState.value = { ...rootStore.uiState.value, inputMessageId: message.id };
    const store = rootStore.fieldRequestStore.value!;
    store.activeFieldRequestMessage = signal(message);
    // Set after the message: a new active message resets the store's values.
    if (field.value) store.setFieldValue(field.value);
    if (field.selected) store.selectedFieldValues.value = field.selected;
    if (field.submitError) store.submitError.value = field.submitError;

    // Picklists in an open messenger (sidebar, docked) are anchored: they render in the
    // timeline, under the agent's question, and the input area renders nothing. Capture
    // them where the visitor sees them.
    const anchored = rootStore.input.isAnchored.value;
    if (anchored) anchoredCases.add(`${mode.id}--${field.id}`);
    const { container, unmount } = render(
      <RootStoreContext.Provider value={rootStore}>
        {anchored ? (
          <FieldRequestRenderer item={message} context={rootStore} />
        ) : (
          <FieldRequest rootStore={rootStore} />
        )}
      </RootStoreContext.Provider>,
    );
    await waitFor(() =>
      expect(container.querySelector("[data-component-name='FieldRequest.InputRow']")).not.toBeNull(),
    );
    // Let effects that set attributes after the first paint settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Preact sets value and checked as properties, which innerHTML doesn't serialize. Copy
    // them into attributes so the static markup shows what the visitor typed or ticked.
    container.querySelectorAll("input").forEach((input) => {
      if (input.type === "checkbox" || input.type === "radio") input.toggleAttribute("checked", input.checked);
      else if (input.value) input.setAttribute("value", input.value);
    });
    container.querySelectorAll("textarea").forEach((textarea) => {
      textarea.textContent = textarea.value;
    });
    fs.writeFileSync(`${OUT}/${mode.id}--${field.id}.html`, container.innerHTML);
    unmount();
  });

  afterAll(() => {
    fs.writeFileSync(
      `${OUT}/states.json`,
      JSON.stringify(
        {
          modes: MODES.map(({ id, label }) => ({ id, label })),
          fields: FIELDS.map(({ id, label, fieldType }) => ({ id, label, fieldType })),
          anchored: [...anchoredCases].sort(),
          themes: THEMES.map(({ id, label, theme }) => ({ id, label, vars: themeVars(theme) })),
        },
        null,
        2,
      ) + "\n",
    );
  });
});
