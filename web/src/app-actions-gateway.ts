import { gatewayReconnectMessage, gatewayReconnectBannerOptions, toGatewayErrorMessage, toGatewayErrorOptions } from './gateway.js';
import type { GatewayActionParams, GatewayActions } from './app-actions-types.js';

export const createGatewayActions = (params: GatewayActionParams): GatewayActions => {
  const getGatewaySocket = (showBanner = true) => {
    if (params.getState().domain.gatewayStatus !== 'connected' || !params.socketRef.current) {
      if (showBanner) {
        params.updateBanner('error', gatewayReconnectMessage, gatewayReconnectBannerOptions);
      }
      return null;
    }
    return params.socketRef.current;
  };

  const sendGatewayMessage = (message: Parameters<GatewayActions['sendGatewayMessage']>[0], showBanner = true) => {
    const socket = getGatewaySocket(showBanner);
    if (!socket) {
      return false;
    }
    try {
      socket.send(message);
      return true;
    } catch (error) {
      if (showBanner) {
        params.updateBanner('error', toGatewayErrorMessage(error, 'Failed to send message'), toGatewayErrorOptions(error));
      }
      return false;
    }
  };

  return { getGatewaySocket, sendGatewayMessage };
};
