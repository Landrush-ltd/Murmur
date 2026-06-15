# Murmur

Murmur is a private, browser-based voice memo app built on the [Sia decentralized storage network](https://sia.tech). Voice memos are recorded in the browser, stored locally in IndexedDB for instant playback, and automatically backed up to Sia after every save, edit, or delete. Users can restore their full memo library on any device using only their Sia recovery phrase and the app's cloud restore flow — no centralized server involved.

## How Sia storage works in Murmur

Murmur uses the `@siafoundation/sia-storage` JavaScript SDK (compiled from the Sia Rust SDK to WebAssembly) and `@siafoundation/sdk` for identity management. Storage operations run entirely in the browser — the app connects directly to the Sia network via the hosted indexer at `https://sia.storage`.

### Connection and identity

On first launch, users either generate a new Sia storage identity or paste a saved recovery phrase to restore an existing one. The connection flow uses the Sia `Builder` pattern:

```typescript
import { Builder, generateRecoveryPhrase, initSia } from '@siafoundation/sia-storage'

await initSia()
const phrase = generateRecoveryPhrase()
const builder = new Builder(SIA_INDEXER_URL, appMetadata)
await builder.requestConnection()
// user approves in the Sia portal
await builder.waitForApproval()
const sdk = await builder.register(phrase)
```

The resulting `AppKey` is exported to hex and stored in localStorage. On subsequent visits, the SDK reconnects using this key without requiring re-approval.

### Backup upload

Every time a memo is saved, edited, or deleted, Murmur serializes the full memo library (including base64-encoded audio blobs) into a JSON backup file and uploads it to Sia:

```typescript
import { PinnedObject } from '@siafoundation/sia-storage'

const backup = await createBackupFile(memos) // returns a Blob
const object = await sdk.upload(new PinnedObject(), backup.stream(), { maxInflight: 10 })

// attach metadata so backups are discoverable later
object.updateMetadata(new TextEncoder().encode(JSON.stringify({
  type: 'murmur-backup',
  version: 1,
  uploadedAt: new Date().toISOString(),
  memoCount: memos.length,
  size: backup.size,
})))

await sdk.pinObject(object)
await sdk.updateObjectMetadata(object)

// store the object ID locally for fast restore reference
console.log('Backup object ID:', object.id())
```

The object ID is saved to localStorage as a quick reference. The backup is also discoverable via `sdk.objectEvents()` even on a fresh device, as long as the user has their recovery phrase.

### Cloud restore

On a new device, the user connects with their recovery phrase, and Murmur fetches their backup history:

```typescript
const events = await sdk.objectEvents(null, 100)
const backups = events
  .filter(event => !event.deleted && event.object)
  .map(event => parseMetadata(event.id, event.object.metadata()))
  .filter(Boolean)
  .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))

// download the most recent backup
const object = await sdk.object(backups[0].objectId)
const stream = sdk.download(object)
const blob = await new Response(stream).blob()
// restore memo library from blob
```

No account, server, or third-party service is needed. The recovery phrase is the only credential.

## Architecture

```
Browser (Murmur)
├── MediaRecorder API         — captures audio
├── IndexedDB (memoStore)     — local working copy for instant playback
├── @siafoundation/sia-storage — upload, pin, download, objectEvents
└── @siafoundation/sdk        — identity, AppKey management

Sia Network
└── Hosted indexer (sia.storage) — contract negotiation, redundancy, retrieval
```

The app has no custom backend. Authentication, storage, and restore are handled entirely by the Sia SDK and the hosted indexer.

## Features

- Record, pause, and resume voice memos with the MediaRecorder API
- Name recordings after capture and tag them with emoji moods
- Local IndexedDB copy for zero-latency playback
- Auto-sync to Sia after every save, edit, or delete
- Cloud restore from any device using a recovery phrase
- List all past backups via Sia object event history
- Export and import local backup files as a fallback
- Search across memo titles, moods, and notes
- Date-grouped memo library with relative timestamps
- Daily recording reminders via browser notifications
- App lock with passcode and device biometrics

## Getting started

```bash
npm install
npm run dev
```

Open the app and click **Set up storage**. You can generate a new storage identity or paste a saved recovery phrase to restore a previous library.

## Scripts

```bash
npm run dev      # start the Vite dev server
npm run build    # type-check and build for production
npm run lint     # run ESLint
npm test         # run the Vitest suite
```

## Recovery phrase

The recovery phrase generated during setup is the only way to restore a memo library on a new device. Murmur displays it once after connection — users must save it. There is no server-side key escrow and no account recovery fallback.

## Privacy and app lock

Murmur's app lock adds a passcode and optional device biometrics to restrict access in the current browser. Audio data and backup files are not encrypted at rest beyond what the Sia network provides (Sia encrypts all data client-side before upload).

## Reminders

Daily recording reminders can be enabled from the Settings panel. Reminder notifications rotate through ideas like daily affirmations, to-do lists, gratitude logs, idea journals, and voice diaries. Murmur also prompts before leaving the page if a recording is active or paused.
