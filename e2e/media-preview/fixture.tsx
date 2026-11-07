import { createRoot } from 'react-dom/client';
import { AccountMediaProvider } from '../../web/src/account-media.js';
import { ConnectionSidebarAccountMenu } from '../../web/src/ConnectionSidebarAccountMenu.js';
import { UserAvatar } from '../../web/src/user-avatars/UserAvatar.js';
import { QueryProfileAvatarBanner } from '../../web/src/QueryProfileAvatarBanner.js';
import { FormattedMessageInlinePreviews } from '../../web/src/FormattedMessageInlinePreviews.js';
import { makeNetwork } from '../../tests/chat-pane.test.fixtures.js';
import '../../web/src/globals.css';

const href = 'https://example.test/picture.png';
const user = { nick: 'Reader' };
createRoot(document.getElementById('root')!).render(
  <AccountMediaProvider network={makeNetwork({ id: 'preview-test' })}>
    <main className="space-y-6 p-8">
      <h1>Media preview regression fixture</h1>
      <section aria-label="Account picture">
        <ConnectionSidebarAccountMenu name="Test account" imageUrl={href} onClose={() => {}} />
      </section>
      <section aria-label="No account picture">
        <ConnectionSidebarAccountMenu name="No picture" onClose={() => {}} />
      </section>
      <section aria-label="User avatar">
        <UserAvatar user={user} enabled preview customAvatarUrl={href} size="lg" />
      </section>
      <section aria-label="DM profile picture">
        <QueryProfileAvatarBanner user={user} enabled networkId="preview-test" customAvatarUrl={href} variant="compact" />
      </section>
      <section aria-label="Message image">
        <FormattedMessageInlinePreviews media={[{ kind: 'image', originalHref: href, sourceHref: href }]} />
      </section>
    </main>
  </AccountMediaProvider>,
);
