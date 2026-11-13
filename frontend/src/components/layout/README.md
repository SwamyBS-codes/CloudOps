/**
 * Layout Components
 * Reusable layout components including navbar and wrappers
 */

# Layout Components

## Components

### Navbar

Square-corner navigation with clear active states and mobile support.

#### Features
- ▪ Flat surfaces with quiet borders
- 🎯 Sticky positioning with scroll effects
- 📱 Fully responsive mobile menu
- ✅ Smooth hover animations
- 🎨 Cobalt active and hover states
- 🌐 GitHub OAuth login button
- ♿ Accessibility support
- ⚡ Framer Motion animations

#### Usage

```tsx
import { Navbar } from '@/components/layout';

export const HomePage = () => {
  return (
    <>
      <Navbar />
      <main>
        {/* Page content */}
      </main>
    </>
  );
};
```

#### Props

The Navbar component is self-contained and doesn't require props. It:
- Manages its own scroll state
- Handles mobile menu toggle
- Detects scroll position for blur effect

#### Styling

The navbar uses:
- **Design Tokens**: CSS variables from `src/styles/tokens.css`
- **Tailwind CSS**: For responsive utilities
- **CSS Custom Styles**: shared design tokens for color and geometry
- **Framer Motion**: For smooth transitions

#### Customization

To customize navbar links, edit the `navLinks` array in `Navbar.tsx`:

```tsx
const navLinks: NavLink[] = [
  { label: 'Custom Link', href: '/custom' },
  { label: 'External', href: 'https://example.com' },
];
```

To customize colors, edit CSS variables in `src/styles/tokens.css`:
- `--color-primary`: Main brand color
- `--color-accent`: Accent color
- `--color-text-primary`: Text color

### Logo

CloudOps brand logo component with animated icon.

#### Features
- 🎭 Animated cloud icon with pulsing glow
- 🎨 Gradient text effect
- ♻️ Continuous pulsing animation
- 🔗 Clickable logo that navigates to home

#### Usage

```tsx
import { Logo } from '@/components/layout';

export const MyComponent = () => {
  return <Logo />;
};
```

### Layout

Wrapper component that provides standard layout with navbar.

#### Features
- 🧩 Reusable layout wrapper
- 🎯 Optional navbar toggle
- 📦 Scoped main content area
- 🎨 Consistent spacing

#### Usage

```tsx
import { Layout } from '@/components/layout';

export const HomePage = () => {
  return (
    <Layout>
      {/* Page content automatically wrapped with navbar */}
    </Layout>
  );
};
```

#### Props

```tsx
interface LayoutProps {
  children: React.ReactNode;        // Page content
  showNavbar?: boolean;              // Show/hide navbar (default: true)
  className?: string;                // Additional classes for main content
}
```

## Responsive Behavior

### Desktop (> 768px)
- Full navigation links displayed
- GitHub login button visible
- No mobile menu

### Tablet (768px - 1024px)
- Navigation links displayed
- GitHub button visible
- Responsive padding

### Mobile (< 768px)
- Hamburger menu button
- Slide-out mobile menu with links
- Mobile-optimized GitHub button
- Reduced logo subtitle
- Full-width navigation

## Animations

### Navbar Link Hover
- Smooth color transition
- Animated underline appears
- Chevron icon rotates (if submenu present)

### Mobile Menu
- Slide-in animation from top
- Staggered link animations
- Icon swap (menu ↔ close)

### Logo
- Hover: Icon rotates slightly
- Always: Pulsing glow effect

### Scroll Effect
- Background blur increases on scroll
- Shadow intensity increases
- Border opacity changes

## Accessibility

- ✅ Semantic HTML
- ✅ ARIA labels where needed
- ✅ Keyboard navigation support
- ✅ Reduced motion support
- ✅ Focus visible indicators
- ✅ Color contrast compliant

## Performance

- 🚀 Uses React.memo for optimization
- 📦 Lazy loaded icons (Lucide React)
- ✨ GPU-accelerated animations
- 🎯 Optimized re-renders

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers

## Future Enhancements

- [ ] Dropdown menus
- [ ] Search functionality
- [ ] Notifications bell
- [ ] User profile menu
- [ ] Dark/light theme toggle
- [ ] Multi-language support

## Related Files

- `Navbar.tsx` - Main navbar component
- `Navbar.css` - Navbar styles
- `Logo.tsx` - Logo component
- `Layout.tsx` - Layout wrapper
- `src/styles/globals.css` - Global styles
- `src/styles/tokens.css` - Design tokens

---

**Last Updated**: May 2026  
**Version**: 1.0.0
