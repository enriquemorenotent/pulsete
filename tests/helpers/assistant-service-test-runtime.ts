export const flushAssistantEvents = () => new Promise((resolve) => setImmediate(resolve));

export type AppServerCall = { method: string; params: unknown };
