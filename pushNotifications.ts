import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export const SERVICE_NOTIFICATION_CHANNEL = 'service-updates';

type ServiceNotificationPayload = {
  id: string;
  title: string;
  message: string;
  ticketId?: string;
  invoiceId?: string;
};

export type PushRegistration = {
  expoPushToken?: string;
  devicePushToken?: string;
};

export const isExpoGo = Constants.appOwnership === 'expo';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerForPushNotificationsAsync(): Promise<PushRegistration | null> {
  if (Platform.OS === 'web') return null;

  // Remote push notifications are unsupported in Expo Go on Android (SDK 53+).
  // Bail out before touching Android notification channels or remote token APIs.
  if (isExpoGo && Platform.OS === 'android') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(SERVICE_NOTIFICATION_CHANNEL, {
      name: 'Service updates',
      description: 'Ticket status, invoices, and rider service alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0f766e',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });
  }

  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  // Remote push tokens are unavailable in Expo Go on Android (SDK 53+).
  if (isExpoGo) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const registration: PushRegistration = {};

  try {
    if (projectId) {
      registration.expoPushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    }
  } catch (error) {
    console.warn('Unable to get Expo push token:', error);
  }

  try {
    const deviceToken = await Notifications.getDevicePushTokenAsync();
    registration.devicePushToken = typeof deviceToken.data === 'string'
      ? deviceToken.data
      : JSON.stringify(deviceToken.data);
  } catch (error) {
    console.warn('Unable to get device push token:', error);
  }

  return registration.expoPushToken || registration.devicePushToken ? registration : null;
}

export async function presentServiceNotification(notification: ServiceNotificationPayload) {
  if (Platform.OS === 'web') return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: notification.title,
      body: notification.message,
      sound: 'default',
      data: {
        notificationId: notification.id,
        ticketId: notification.ticketId || '',
        invoiceId: notification.invoiceId || '',
      },
      ...(Platform.OS === 'android' ? { channelId: SERVICE_NOTIFICATION_CHANNEL } : {}),
    },
    trigger: null,
  });
}

export function getNotificationDeepLink(data: unknown) {
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const ticketId = typeof payload.ticketId === 'string' ? payload.ticketId : '';
  const invoiceId = typeof payload.invoiceId === 'string' ? payload.invoiceId : '';
  return { ticketId, invoiceId };
}
