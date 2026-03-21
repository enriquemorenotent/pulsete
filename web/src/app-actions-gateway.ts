import { gatewayReconnectMessage } from './gateway.js';
import type { GatewayActionParams, GatewayActions } from './app-actions-types.js';

export const createGatewayActions = (params: GatewayActionParams): GatewayActions => {
  const getGatewaySocket = (showBanner = true) => {
    if (params.gatewayStatus !== 'connected' || !params.socketRef.current) {
      if (showBanner) {
        params.updateBanner('error', gatewayReconnectMessage);
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
    } catch {
      if (showBanner) {
        params.updateBanner('error', gatewayReconnectMessage);
      }
      return false;
    }
  };

  return { getGatewaySocket, sendGatewayMessage };
};
