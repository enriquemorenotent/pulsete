import { z } from 'zod';
import { aiAssistantSelectionSchema } from './protocol-ai.js';
import { networkUserIdentitySchema } from './user-identity.js';

export const contactNotificationSoundSchema = z.enum(['chirp', 'bell', 'glass']);
export type ContactNotificationSound = z.infer<typeof contactNotificationSoundSchema>;

export const contactNotificationContactSchema = z.object({
  identity: networkUserIdentitySchema.optional(),
  networkId: z.string().min(1),
  nick: z.string().trim().min(1),
});
export type ContactNotificationContact = z.infer<typeof contactNotificationContactSchema>;

export const contactNotificationChannelSchema = z.object({
  channel: z.string().trim().min(1),
  networkId: z.string().min(1),
});
export type ContactNotificationChannel = z.infer<typeof contactNotificationChannelSchema>;

export const contactNotificationSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  systemEnabled: z.boolean().default(false),
  sound: contactNotificationSoundSchema.default('chirp'),
  contacts: z.array(contactNotificationContactSchema).default([]),
  channels: z.array(contactNotificationChannelSchema).default([]),
});
export type ContactNotificationSettings = z.infer<typeof contactNotificationSettingsSchema>;

export const mediaVisibilityModeSchema = z.enum(['show-media', 'hide-media']);
export type MediaVisibilityMode = z.infer<typeof mediaVisibilityModeSchema>;

export const serverSidebarAccordionIdSchema = z.enum([
  'connection',
  'history',
  'capabilities',
  'notes',
]);
export type ServerSidebarAccordionId = z.infer<typeof serverSidebarAccordionIdSchema>;

export const serverSidebarAccordionStateSchema = z.object({
  connection: z.boolean().optional(),
  history: z.boolean().optional(),
  capabilities: z.boolean().optional(),
  notes: z.boolean().optional(),
});
export type ServerSidebarAccordionState = z.infer<typeof serverSidebarAccordionStateSchema>;

export const defaultSidebarWidth = 256;
export const minSidebarWidth = 208;
export const maxSidebarWidth = 420;
export const maxDraftCharacters = 64 * 1024;

const sidebarWidthSchema = z.number().finite().transform((value) =>
  Math.min(maxSidebarWidth, Math.max(minSidebarWidth, Math.round(value)))
);

export const workspacePreferencesSchema = z.object({
  aiAssistant: aiAssistantSelectionSchema.default({
    model: null,
    reasoningEffort: null,
  }),
  contactNotifications: contactNotificationSettingsSchema.default({
    enabled: false,
    systemEnabled: false,
    sound: 'chirp',
    contacts: [],
    channels: [],
  }),
  mediaVisibilityMode: mediaVisibilityModeSchema.default('show-media'),
  externalAvatarsEnabled: z.boolean().default(false),
  hideOfflineFriends: z.boolean().default(false),
  leftSidebarWidth: sidebarWidthSchema.default(defaultSidebarWidth),
  rightSidebarWidth: sidebarWidthSchema.default(defaultSidebarWidth),
  serverSidebarAccordions: z.record(serverSidebarAccordionStateSchema).default({}),
});
export type WorkspacePreferences = z.infer<typeof workspacePreferencesSchema>;

export const defaultWorkspacePreferences: WorkspacePreferences =
  workspacePreferencesSchema.parse({});

export const workspacePreferencesPatchSchema = z.object({
  aiAssistant: aiAssistantSelectionSchema.optional(),
  contactNotifications: contactNotificationSettingsSchema.optional(),
  mediaVisibilityMode: mediaVisibilityModeSchema.optional(),
  externalAvatarsEnabled: z.boolean().optional(),
  hideOfflineFriends: z.boolean().optional(),
  leftSidebarWidth: sidebarWidthSchema.optional(),
  rightSidebarWidth: sidebarWidthSchema.optional(),
  serverSidebarAccordions: z.record(serverSidebarAccordionStateSchema).optional(),
}).strict();
export type WorkspacePreferencesPatch = z.infer<typeof workspacePreferencesPatchSchema>;

export const bufferDraftSchema = z.object({
  bufferId: z.string().min(1),
  networkId: z.string().min(1),
  body: z.string().max(maxDraftCharacters),
  updatedAt: z.number().int().nonnegative(),
});
export type BufferDraft = z.infer<typeof bufferDraftSchema>;

export const userAvatarOverrideSchema = z.object({
  id: z.string().min(1),
  networkId: z.string().min(1),
  nick: z.string().trim().min(1),
  identity: networkUserIdentitySchema,
  imageUrl: z.string().min(1),
  updatedAt: z.number().int().nonnegative(),
});
export type UserAvatarOverride = z.infer<typeof userAvatarOverrideSchema>;
