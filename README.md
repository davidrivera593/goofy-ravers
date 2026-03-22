# Goofy Ravers

A community platform for the Arizona underground rave and electronic music scene. Upload event flyers, discover venues on an interactive map, and connect with the local scene.

Built for the hackathon by **Team Goofy Goners**.

## Demo

[![Goofy Ravers Demo](https://img.youtube.com/vi/onuT4owwBTg/maxresdefault.jpg)](https://youtu.be/onuT4owwBTg)

## Features

### AI-Powered Flyer Upload

Drop a flyer image and Claude AI automatically extracts event details — title, date, venue, address, city, genres, DJs, and description. Review the auto-filled form, edit if needed, and submit.

### Community Feed

A real-time masonry feed combining event flyers and status posts. Like, comment, and mark "I'm going" on events. Status posts support text, image attachments, and YouTube link embeds. Full-text search across titles, venues, DJs, and more.

### Interactive Map

A dark-themed Mapbox GL map of Arizona that auto-pins venues from uploaded flyers. Smart geocoding uses extracted street addresses for precise placement, falling back to venue + city lookup. Click any marker to see linked events and a Claude-generated "vibe check" — a poetic description of the location's scene energy. Users can also manually drop pins via Shift+Click or the mobile pin mode button.

### AI Design Chat

Ask Claude for flyer design advice — typography, color palettes, layout wireframes, and Photopea techniques. The AI has context from your recent flyers to give scene-relevant suggestions.

### Event Calendar

Browse upcoming events in a calendar view with city filtering and day selection. Countdown badges on flyer cards show "TONIGHT", "TOMORROW", or "X DAYS AWAY".

### User Profiles

Customizable profiles with avatar upload, bio, year joined, and a favorite SoundCloud track embed. Avatars propagate across the entire app — feed cards, post modals, comments, and the nav bar. Visit other users' profiles by clicking their name on any post.

### Flyer Gallery

A searchable, filterable grid of all event flyers. Filter by genre, city, date range, or search by title/venue/DJs.

## Tech Stack

| Layer     | Technology                                             |
| --------- | ------------------------------------------------------ |
| Frontend  | React 19, Vite 8, React Router v7                      |
| Styling   | Custom CSS (dark theme, CSS variables, masonry layout) |
| Auth      | Firebase Auth (email/password + Google OAuth)          |
| Database  | Cloud Firestore (real-time `onSnapshot` listeners)     |
| Storage   | Firebase Storage (flyers, post images, avatars)        |
| Map       | Mapbox GL JS + react-map-gl v8                         |
| Geocoding | Mapbox Geocoding API (address-aware, Firestore-cached) |
| AI        | Claude API (Haiku) via Firebase Cloud Function proxy   |

## Architecture

```
src/
  App.jsx                # Routes + auth guard
  firebase/config.js     # Firebase init (auth, db, storage)
  lib/
    claude.js            # Claude API client
    geocode.js           # Smart geocoding with caching
  components/
    AppLayout.jsx        # Shared nav + avatar listener
    PostModal.jsx        # Post detail (likes, going, comments, edit)
    StatusComposer.jsx   # Shared composer (text, image, YouTube)
  pages/
    home.jsx             # Login / signup
    dashboard.jsx        # Community feed
    flyers.jsx           # Flyer gallery + filters
    upload.jsx           # AI flyer upload + edit
    map.jsx              # Interactive venue map
    calendar.jsx         # Event calendar
    chat.jsx             # AI design chat
    profile.jsx          # Own profile + posts
    userProfile.jsx      # Public user profiles
functions/
  index.js               # claudeProxy Cloud Function
```

## Getting Started

```bash
npm install
cp .env.example .env     # Fill in Firebase + Mapbox keys
npm run dev
```

### Environment Variables

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_MAPBOX_TOKEN=
```

The Claude API key is stored as a Firebase secret used by the Cloud Function proxy — no client-side AI key needed.

### Firebase Console Setup

- **Authentication** > Sign-in method: Enable **Email/Password** and **Google**
- **Firestore**: Create composite indexes for `(uploadedBy ASC, uploadedAt DESC)` on both `flyers` and `posts` collections (or click the auto-link in the console error)
- **Storage**: Ensure authenticated read/write rules are enabled

## AI Integration

Claude powers three features across the app:

1. **Flyer parsing** — Vision model reads flyer images and extracts structured event data (title, date, venue, address, city, genres, DJs) as JSON
2. **Map vibe checks** — Generates poetic location descriptions for venue markers, cached in Firestore after first generation
3. **Design chat** — Context-aware flyer design advice with layout wireframe generation
