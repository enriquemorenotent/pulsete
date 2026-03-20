export const gatewayReconnectMessage = 'Reconnecting to gateway';
export const gatewaySocketClosedMessage = 'Gateway socket is not open';

export const getGatewayReconnectDelayMs = (attempt: number) => {
  if (attempt <= 0) {
    return 1_000;
  }
  if (attempt === 1) {
    return 2_000;
  }
  return 5_000;
};

export const isGatewaySocketClosedError = (error: unknown): error is Error =>
  error instanceof Error && error.message === gatewaySocketClosedMessage;

export const toGatewayErrorMessage = (error: unknown, fallback: string) =>
  isGatewaySocketClosedError(error) ? gatewayReconnectMessage : error instanceof Error ? error.message : fallback;
