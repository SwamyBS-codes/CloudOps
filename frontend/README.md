# CloudOps Frontend

Modern React.js + Vite SaaS frontend for automated AWS deployment platform with predictive cost engine.

## Design system

- **Dark cloud control room**: Deep indigo surfaces, high-contrast text, electric-blue actions, and restrained operational status colors
- **Square geometry**: Cards, controls, dialogs, badges, and avatars use zero corner radius
- **Responsive**: Desktop sidebar and utility bar adapt to a compact mobile navigation
- **Accessible**: Visible keyboard focus, readable status labels, and reduced-motion support

## 🛠️ Tech Stack

- **React 18** - UI library
- **Vite 5** - Build tool and dev server
- **TypeScript** - Type safety
- **Tailwind CSS 3** - Styling
- **Framer Motion 10** - Animations
- **React Router 6** - Routing
- **TanStack Query 5** - Server state management
- **Zustand 4** - Client state management
- **Axios** - HTTP client
- **Lucide React** - Icons
- **Radix UI** - Accessible components

## 📁 Project Structure

```
src/
├── app/                    # Application shell
├── features/              # Feature modules (dashboard, deployment, etc)
├── components/            # Shared UI components
├── services/              # API & business logic
├── hooks/                 # Custom React hooks
├── context/               # React Context providers
├── store/                 # Zustand stores
├── lib/                   # Utilities & constants
├── styles/                # Global styles & design tokens
└── types/                 # TypeScript types
```

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env.local

# Development server
npm run dev

# Production build
npm run build
```

## Design features

- **Color scheme**: Dark-only indigo palette adapted from the [21st.dev theme](https://21st.dev/@profitsalesorg-crypto/themes/promotor-wow-1784919270278), with blue emphasis and semantic status colors
- **Typography**: Inter for interface text and JetBrains Mono for deployment IDs, metrics, and logs
- **Surfaces**: Fine borders and flat panels rather than glass, glow, or heavy gradients
- **Dark mode**: Fixed dark theme; no light-mode toggle or light palette
- **Motion**: Restrained transitions support state changes without distracting from deployment status

## 📦 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run format` - Format code
- `npm run type-check` - TypeScript check

## 🔧 Configuration

All configs are production-ready:
- `vite.config.ts` - Optimized build
- `tailwind.config.ts` - Extended theme
- `tsconfig.json` - Strict TypeScript
- `.eslintrc.cjs` - Code standards
- `.prettierrc` - Code formatting

## 📖 Documentation

See individual files for detailed documentation on:
- **Styling**: `src/styles/globals.css` and `src/styles/tokens.css`
- **Components**: Start with component files in `src/components/`
- **Services**: API integration in `src/services/`
- **Hooks**: Custom hooks in `src/hooks/`

## 🔐 Security

- Environment-based configuration
- Secure token handling
- CORS support
- Input validation utilities

## 📄 License

MIT License

---
**Status**: Production-Ready  
**Last Updated**: May 2026
