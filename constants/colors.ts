/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#F8FAFF',
    tint: '#A7B8FF',

    // Core surfaces
    background: '#071124',
    foreground: '#F8FAFF',

    // Cards / elevated surfaces
    card: '#13213C',
    cardForeground: '#F8FAFF',

    // Primary action color (buttons, links, active states)
    primary: '#A7B8FF',
    primaryForeground: '#101426',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#1C2C4D',
    secondaryForeground: '#F8FAFF',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#1A2947',
    mutedForeground: '#9AA9C9',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#6D7CFF',
    accentForeground: '#F8FAFF',

    // Destructive actions (delete, error states)
    destructive: '#FF6A80',
    destructiveForeground: '#F8FAFF',

    // Borders and input outlines
    border: 'rgba(255,255,255,0.14)',
    input: 'rgba(255,255,255,0.18)',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 20,
};

export default colors;
