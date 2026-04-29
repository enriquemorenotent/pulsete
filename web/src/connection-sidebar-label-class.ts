import { cn } from '@/lib/utils.js';

type ConnectionSidebarLabelActivity = {
	hasUnread: boolean;
	priority: boolean;
};

type ConnectionSidebarLabelOptions = {
	dimmed?: boolean;
	offline?: boolean;
};

export const connectionSidebarLabelClass = (
	activity: ConnectionSidebarLabelActivity,
	options: ConnectionSidebarLabelOptions = {},
) =>
	cn(
		'truncate text-[12px] text-foreground',
		activity.priority
			? 'font-semibold'
			: activity.hasUnread
				? 'font-medium'
				: null,
		options.dimmed && !activity.hasUnread && 'text-muted-foreground',
		options.offline && !activity.hasUnread && 'text-muted-foreground/90',
	);
