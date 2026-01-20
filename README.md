<p align="center">
  <img src="skillmon.svg" alt="skillmon logo" width="128" />
</p>

# skillmon

Skillmon is a desktop application for monitoring and planning character training in EVE Online.

# DISCLAIMER

This project is not yet in a stable state, no support will be provided yet. Your skill queues might be haunted.

<p align="center">
  <img src="https://media1.tenor.com/m/fI5ECURBfGgAAAAC/john-cena-the-bear.gif" alt="haunted" width="320" />
</p>

## Major Features

- **Multi-Character Support**: Manage and monitor all your EVE Online characters in one place.
- **Account Grouping**: Organize your characters into custom accounts.
- **Skill Queue Monitoring**: Real-time tracking of skill queues.
- **Advanced Skill Planning**:
  - Create, edit, and manage complex skill plans.
  - Import/Export plans in various formats (Text, XML, JSON).
  - Compare plans against your characters' current skills.
  - Automatic prerequisite handling.
- **Simulation & Optimization**:
  - **Timeline Simulation**: Visualize when your skills will finish.
  - **Remap Optimization**: Calculate the most efficient attribute remaps for your plan.
  - **Reorder Optimization**: Automatically reorder your plan to maximize training speed based on attributes.
- **Character Notifications**: System tray notifications for low skill queues and other important events.
- **Offline First**: All your data is stored in a local SQLite database. No external servers or account requirements beyond EVE SSO.
- **SDE Integration**: Built-in EVE Static Data Export (SDE) management.

## Tech Stack

Skillmon leverages a modern, high-performance stack:

- **Backend**: [Rust](https://www.rust-lang.org/) with [Tauri v2](https://tauri.app/)
- **Frontend**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Database**: [SQLite](https://www.sqlite.org/) via [sqlx](https://github.com/launchbadge/sqlx)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand) & [TanStack Query](https://tanstack.com/query/latest)

## Getting Started

### Prerequisites

To build and run skillmon locally, you will need:

- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Node.js](https://nodejs.org/) & [pnpm](https://pnpm.io/)
- [EVE Online Developer Application](https://developers.eveonline.com/) credentials

### Environment Setup

Create a `.env` file in the root directory (or set these environment variables in your shell):

```bash
# Required: Your EVE Online SSO Client ID
EVE_CLIENT_ID=your_client_id_here

# Optional: Defaults to http://localhost:1421/callback for dev
EVE_CALLBACK_URL=http://localhost:1421/callback
```

_Note: Ensure your EVE Developer App has the correct callback URL configured._

### Development Commands

1. **Install dependencies**:

   ```bash
   pnpm install
   ```

2. **Generate ESI Client**:

   ```bash
   ./scripts/generate-esi.sh
   ```

3. **Run in development mode**:

   ```bash
   pnpm tauri dev
   ```

4. **Run tests**:
   ```bash
   pnpm test        # Frontend tests
   cargo test       # Rust tests (in src-tauri)
   ```

## Development Documentation

Technical details and architecture overviews are documented in `.cursor/rules`. These files provide valuable context for developers and are optimized for AI-assisted development.

## Contributing

This project is in an early stage of development. Contributions, bug reports, and feature suggestions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

_Disclaimer: EVE Online and the EVE logo are the registered trademarks of CCP hf. All rights are reserved worldwide. All other trademarks are the property of their respective owners. CCP hf. has granted permission to use EVE Online and all associated logos and designs for promotional and information purposes on its website but does not endorse, and is not in any way affiliated with, skillmon. CCP is not responsible for the content, functional, or operational aspects of this website and application._
