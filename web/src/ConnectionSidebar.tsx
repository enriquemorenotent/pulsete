import { memo } from 'react';
import { ConnectionSidebarServerSwitcher } from './ConnectionSidebarServerSwitcher.js';
import type { ConnectionSidebarProps } from './connection-sidebar-types.js';

export type { ConnectionSidebarProps } from './connection-sidebar-types.js';

export const ConnectionSidebar = memo(function ConnectionSidebar(
	props: ConnectionSidebarProps,
) {
	return (
		<aside className="flex h-full min-h-0 flex-col overflow-hidden">
			<ConnectionSidebarServerSwitcher {...props} />
		</aside>
	);
});
