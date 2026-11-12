# CloudOps control room design system

The interface is a deployment control room: information-dense where teams monitor services, calm where they configure them, and legible at a glance. Its visual language uses square geometry, quiet borders, and color only when it carries meaning.

## Design tokens

| Role | Dark theme | Use |
|---|---|---|
| Canvas | `hsl(0 0% 3%)` | Application background |
| Surface | `hsl(0 0% 7%)` | Cards, menus, and dialogs |
| Ink | `hsl(0 0% 96%)` | Headings and primary text |
| Primary | `hsl(221 87% 53%)` | Primary actions and active navigation |
| Accent | `hsl(221 70% 45%)` | Secondary emphasis |
| Success | `hsl(153 55% 48%)` | Healthy and completed states |
| Border | `hsl(0 0% 17%)` | Panel boundaries and table separators |

The dark-only palette uses neutral charcoal surfaces, with blue reserved for primary actions and active navigation. The radius token is `0` to preserve the square-corner requirement.

Inter is used for interface and display text. JetBrains Mono is reserved for deployment identifiers, metrics, branches, and logs.

## Geometry and surfaces

- Every panel, button, field, dialog, badge, and avatar is rectangular with a zero-pixel corner radius.
- Use thin borders to group related information; avoid decorative shadows, glass blur, and gradient fills.
- Use status color sparingly and pair it with a text label or icon.
- Use alignment, spacing, and typography to establish hierarchy instead of ornamental decoration.

## Application structure

Authenticated screens share a fixed left navigation rail and a compact top utility bar. The main canvas begins with a page title, brief context, and page-specific actions, followed by aligned metric panels, tables, charts, or activity streams. On small screens, the navigation becomes a drawer and content panels stack without horizontal overflow.

The public home page explains the GitHub-to-cloud deployment workflow. Its signature visual is a square, three-stage source/build/deploy pipeline panel, matching the status language used inside the dashboard.

## Components and states

- **Navigation:** Cobalt left rule and tinted surface mark the active page.
- **Buttons:** Solid cobalt for the primary action, outlined for secondary actions, and quiet text buttons for tertiary actions.
- **Cards and tables:** Graphite surfaces, subtle border, no gradient fill.
- **Statuses:** Compact uppercase labels with an icon where useful; color never carries status by itself.
- **Loading and empty states:** Keep the page structure stable and explain the next action.
- **Focus:** Keyboard focus uses a visible cobalt ring with sufficient contrast.

## Responsive behavior and motion

Keep the desktop sidebar and utility bar mounted while the selected page changes inside the content outlet. On narrow screens, expose navigation through a labeled drawer. Tables may scroll within their own panel, while forms and metric grids reflow into a single column. Motion is limited to brief local state transitions, and should respect `prefers-reduced-motion`.
