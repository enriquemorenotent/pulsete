import { cn } from '@/lib/utils.js';

type ConnectionSidebarLabelActivity = {
	hasUnread: boolean;
	priority: boolean;
};

type ConnectionSidebarLabelOptions = {
	dimmed?: boolean;
	offline?: boolean;
	selected?: boolean;
	variant?: 'buffer' | 'network';
};

export const connectionSidebarLabelClass = (
	activity: ConnectionSidebarLabelActivity,
	options: ConnectionSidebarLabelOptions = {},
) =>
	cn(
		'truncate',
		options.variant === 'network' ? 'text-[12.5px]' : 'text-[12px]',
		options.selected || activity.hasUnread
			? 'text-foreground'
			: options.variant === 'network'
				? 'text-foreground/88'
				: 'text-muted-foreground/88',
		options.selected || activity.priority
			? 'font-semibold'
			: activity.hasUnread || options.variant === 'network'
				? 'font-medium'
				: null,
		options.dimmed && !activity.hasUnread && !options.selected && 'text-muted-foreground/62',
		options.offline && !activity.hasUnread && !options.selected && 'text-muted-foreground/58',
	);

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
