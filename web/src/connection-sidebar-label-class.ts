import { cn } from '@/lib/utils.js';

type ConnectionSidebarLabelActivity = {
	hasUnread: boolean;
	priority: boolean;
};

type ConnectionSidebarLabelOptions = {
	selected?: boolean;
	variant?: 'buffer' | 'network';
};

export const connectionSidebarLabelClass = (
	activity: ConnectionSidebarLabelActivity,
	options: ConnectionSidebarLabelOptions = {},
) => {
	const networkLabel = options.variant === 'network';

	return cn(
		'truncate transition-colors',
		networkLabel ? 'text-[12.5px]' : 'text-[12px]',
		networkLabel
			? !options.selected && !activity.hasUnread
				? 'text-foreground/88'
				: 'text-foreground'
			: options.selected || activity.hasUnread
				? 'text-foreground'
				: 'text-muted-foreground/88',
		networkLabel
			? options.selected || activity.priority
				? 'font-semibold'
				: 'font-medium'
			: activity.hasUnread
				? 'font-semibold'
				: null,
	);
};

type ConnectionSidebarRowOptions = {
	dimmed?: boolean;
	selected: boolean;
	variant?: 'default' | 'selector';
};

export const connectionSidebarRowClass = (
	activity: ConnectionSidebarLabelActivity,
	options: ConnectionSidebarRowOptions,
) =>
	options.variant === 'selector'
		? cn(
			'group relative flex items-stretch overflow-hidden rounded-lg transition-colors',
			options.selected
				? 'bg-[#2a2d32]'
				: 'hover:bg-white/[0.035] focus-within:bg-white/[0.04]',
			options.dimmed && !activity.hasUnread && !options.selected && 'opacity-70',
		)
		: cn(
			'group relative flex items-stretch overflow-hidden rounded-sm border border-l-2 border-transparent transition-colors',
			options.selected
				? 'border-primary/35 border-l-primary bg-primary/[0.13] ring-1 ring-inset ring-primary/25'
				: 'hover:border-white/10 hover:bg-white/[0.04] focus-within:bg-white/[0.045]',
			options.dimmed && !activity.hasUnread && !options.selected && 'opacity-75',
		);
