import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesktopShellLayout } from '../../web/src/DesktopShellLayout.js';
import { ChatPaneHeaderActionMenu } from '../../web/src/ChatPaneHeaderActionMenu.js';
import { QueryAvatarOptionsMenu } from '../../web/src/QueryAvatarOptionsMenu.js';
import { NickEmojiEditorControl } from '../../web/src/NickEmojiEditorControl.js';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '../../web/src/components/ui/dialog.js';
import { Button } from '../../web/src/components/ui/button.js';
import { createDesktopShellLayoutProps } from '../../tests/desktop-shell-layout.fixture.js';
import '../../web/src/globals.css';

function Fixture() {
  const [jumps, setJumps] = useState(0);
  const [palette, setPalette] = useState(0);
  const [action, setAction] = useState('none');
  const actions = ['First action', 'Second action'].map(label => ({ id: label, label, onSelect: () => setAction(label) }));
  return <DesktopShellLayout {...createDesktopShellLayoutProps({
    onJumpChatToLatest: () => setJumps(n => n + 1),
    commandPalette: { open: false, onOpen: () => setPalette(n => n + 1) },
    chat: <div className="flex flex-col gap-6 p-8">
      <h1>Menu regression fixture</h1>
      <output>{`jumps=${jumps}; palette=${palette}; action=${action}`}</output>
      <div className="flex gap-4">
        <ChatPaneHeaderActionMenu actions={actions} />
        <QueryAvatarOptionsMenu networkId="test" user={{ nick: 'Reader' }} externalAvatarsEnabled={false} />
        <NickEmojiEditorControl nick="Reader" emoji={null} onSave={async () => true} />
      </div>
      <Button>Outside button</Button>
      <Dialog>
        <DialogTrigger asChild><Button>Open test dialog</Button></DialogTrigger>
        <DialogContent>
          <DialogTitle>Test dialog</DialogTitle>
          <DialogDescription>Test nested keyboard handling.</DialogDescription>
          <input aria-label="Dialog input" />
          <ChatPaneHeaderActionMenu actions={actions} />
        </DialogContent>
      </Dialog>
    </div>,
  })} />;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
