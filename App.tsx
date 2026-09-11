import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { addDoc, collection, doc, getDoc, getDocs, getFirestore, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'dashboard' | 'ticket' | 'history' | 'profile';
type TicketStatus = 'Under Review' | 'Approved' | 'Completed' | 'Rejected';

type Ticket = {
  id: string;
  category: string;
  issue: string;
  cost: number;
  status: TicketStatus;
  date: string;
  vehicle: string;
  plateNumber: string;
  invoiceId?: string;
  invoiceNumber?: string;
};

type Invoice = {
  id: string;
  invoiceNumber: string;
  ticketId: string;
  riderId: string;
  riderName: string;
  riderPhone?: string;
  vehicleName: string;
  plateNumber: string;
  serviceCategory: string;
  issueTitle: string;
  description: string;
  completionDate?: { toDate?: () => Date } | Date | string;
  subtotal: number;
  additionalCharges: number;
  totalAmount: number;
  status: string;
};

type Rider = {
  id: string;
  username?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  salary?: number;
  licenseNumber?: string;
  iqamaNid?: string;
  city?: string;
  emergencyContact?: string;
  vehicle?: string;
  plateNumber?: string;
  vehicleId?: string;
  expoPushToken?: string;
};

type Vehicle = {
  id: string;
  modelName: string;
  plateNumber: string;
  vehicleType?: string;
  fuelType?: string;
  currentOdo?: number | string;
  status?: string;
  lastOilChangeDate?: { toDate?: () => Date } | Date | string | null;
};

const getOilChangeStatus = (value: Vehicle['lastOilChangeDate']) => {
  const lastChange = value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(`${value}T00:00:00`)
      : value?.toDate?.();

  if (!lastChange || Number.isNaN(lastChange.getTime())) return { label: 'Oil change date not set', tone: 'neutral' as const };

  const nextChange = new Date(lastChange.getFullYear(), lastChange.getMonth(), lastChange.getDate() + 11);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const remainingDays = Math.round((nextChange.getTime() - todayStart.getTime()) / 86400000);

  if (remainingDays === 0) return { label: 'Oil change due today', tone: 'urgent' as const };
  if (remainingDays < 0) return { label: `Overdue by ${Math.abs(remainingDays)} days`, tone: 'urgent' as const };
  return { label: `${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} left to change oil`, tone: remainingDays <= 2 ? 'soon' as const : 'good' as const };
};

const formatInvoiceDate = (value: Invoice['completionDate']) => {
  const date = value instanceof Date
    ? value
    : typeof value === 'string'
      ? new Date(`${value}T00:00:00`)
      : value?.toDate?.();
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Not available';
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const invoiceLogoAsset = require('./assets/icon.png');
const invoiceLogoUri = Platform.OS === 'web'
  ? invoiceLogoAsset
  : Image.resolveAssetSource(invoiceLogoAsset).uri;

const createInvoiceHtml = (invoice: Invoice) => `
  <!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; } body { margin: 28px; color: #334155; font-family: Arial, sans-serif; font-size: 12px; }
    .top { display: flex; justify-content: space-between; border-bottom: 2px solid #94a3b8; padding-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 10px; } .logo { width: 82px; height: 62px; object-fit: contain; }
    h1 { color: #2878c8; font-size: 22px; margin: 0; } h2 { color: #2878c8; text-transform: uppercase; font-size: 30px; margin: 0; } p { margin: 4px 0; } .muted { color: #64748b; }
    .info { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; border-bottom: 1px solid #e2e8f0; padding: 22px 0; } .label { color: #2878c8; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .7px; } .name { color: #0f172a; font-size: 16px; font-weight: 800; margin-top: 8px; }
    h3 { font-size: 16px; margin: 22px 0 10px; color: #0f172a; } table { width: 100%; border-collapse: collapse; } th { background: #2878c8; color: white; text-align: left; padding: 9px; font-size: 10px; } td { border: 1px solid #e2e8f0; padding: 10px; vertical-align: top; } .total { text-align: right; border-top: 2px solid #2878c8; background: #f8fafc; padding: 14px; font-weight: 800; font-size: 14px; } .amount { color: #2878c8; margin-left: 18px; } .payment { display: inline-block; background: #2878c8; color: white; padding: 8px 10px; font-weight: 800; font-size: 10px; text-transform: uppercase; margin-top: 18px; } footer { border-top: 2px solid #2878c8; margin-top: 20px; padding-top: 10px; color: #64748b; font-size: 10px; }
  </style></head><body>
    <div class="top"><div class="brand"><img class="logo" src="${invoiceLogoUri}" alt="Diana Service Company"><div><h1>Diana Service Logistics</h1><p class="muted">Official maintenance &amp; service</p></div></div><div style="text-align:right"><h2>Invoice</h2><p>Invoice No: <b>${escapeHtml(invoice.invoiceNumber)}</b></p><p>Date: ${escapeHtml(formatInvoiceDate(invoice.completionDate))}</p></div></div>
    <div class="info"><div><div class="label">Invoice To</div><div class="name">${escapeHtml(invoice.riderName)}</div><p>Rider ID: ${escapeHtml(invoice.riderId)}</p><p>Phone: ${escapeHtml(invoice.riderPhone || 'Not available')}</p></div><div><div class="label">Vehicle Information</div><div class="name">${escapeHtml(invoice.vehicleName)}</div><p>Plate No: ${escapeHtml(invoice.plateNumber)}</p><p>Ticket Ref: #${escapeHtml(invoice.ticketId)}</p></div></div>
    <h3>Service Breakdown &amp; Cost Summary</h3><table><thead><tr><th>Problem Category</th><th>Reported Problem &amp; Work Details</th><th>Cost (SAR)</th></tr></thead><tbody><tr><td><b>${escapeHtml(invoice.serviceCategory)}</b></td><td><b>${escapeHtml(invoice.issueTitle)}</b><br><span class="muted">${escapeHtml(invoice.description)}</span></td><td><b>${invoice.subtotal.toFixed(2)} SAR</b></td></tr>${invoice.additionalCharges > 0 ? `<tr><td>Additional Charges</td><td>Service-related charges</td><td><b>${invoice.additionalCharges.toFixed(2)} SAR</b></td></tr>` : ''}</tbody></table>
    <div class="total">Total Approved Amount: <span class="amount">${invoice.totalAmount.toFixed(2)} SAR</span></div><div class="payment">Payment Status: ${escapeHtml(invoice.status)}</div><p class="muted" style="float:right;margin-top:24px">Completed: ${escapeHtml(formatInvoiceDate(invoice.completionDate))}</p><footer>Diana Service Logistics · Maintenance &amp; Service Center · Ticket #${escapeHtml(invoice.ticketId)}</footer>
  </body></html>`;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDyrntWz6COAaa1Vut2GfI454Q8DQS2cCQ',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'ridermobilapp.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'ridermobilapp',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'ridermobilapp.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '822539520590',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:822539520590:web:3b5202daa7ab490924511f',
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const categoryOptions = ['Engine', 'Brake System', 'Tire', 'Electrical', 'Battery', 'Oil Change', 'Lights', 'Suspension', 'Other'];
const RIDER_SESSION_KEY = 'diana-rider-session';
const RIDER_CACHE_KEY = 'diana-rider-cache';
const RIDER_TICKETS_CACHE_KEY = 'diana-rider-tickets-cache';
const RIDER_VEHICLES_CACHE_KEY = 'diana-rider-vehicles-cache';
const RIDER_PROFILE_IMAGE_KEY = 'diana-rider-profile-image';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function sendPushNotification(expoPushToken: string) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: expoPushToken,
      sound: 'default',
      title: 'Original Title',
      body: 'And here is the body!',
      data: { someData: 'goes here' },
    }),
  });

  if (!response.ok) throw new Error(`Push notification request failed: ${response.status}`);
}

function handleRegistrationError(errorMessage: string) {
  console.warn('[push] registration unavailable:', errorMessage);
  throw new Error(errorMessage);
}

function getPushRegistrationErrorMessage(error: unknown) {
  const message = `${error}`;
  if (/unknown host|fetch failed|network request failed|unable to resolve/i.test(message)) {
    return 'Unable to reach Expo push service. Check the Android device internet connection, Wi-Fi, VPN, or Private DNS settings, then try again.';
  }
  return `Unable to register for push notifications: ${message}`;
}

async function registerForPushNotificationsAsync() {
  console.log('[push] registration started on', Platform.OS);

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('service-updates', {
      name: 'Service updates',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.warn('[push] notification permission was not granted:', finalStatus);
    handleRegistrationError('Permission not granted to get push token for push notification!');
    return;
  }

  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  console.log('[push] notification permission granted; project ID:', projectId);
  if (!projectId) {
    handleRegistrationError('Project ID not found');
  }

  try {
    const pushTokenString = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('[push] Expo push token:', pushTokenString);
    return pushTokenString;
  } catch (error: unknown) {
    console.error('[push] Expo push token request failed:', error);
    handleRegistrationError(getPushRegistrationErrorMessage(error));
  }
}

function ScreenFade({ id, children }: { id: string; children: ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [id, opacity, translateY]);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function SoftPressable({
  children,
  style,
  contentStyle,
  ...props
}: PressableProps & { style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle> }) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
        props.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
        props.onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, contentStyle, { transform: [{ scale }] }]}>{children as ReactNode}</Animated.View>
    </Pressable>
  );
}

function EmptyState({ icon, title, message }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; title: string; message: string }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyStateIcon}>
        <MaterialCommunityIcons name={icon} size={28} color="#0f766e" />
      </View>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateMessage}>{message}</Text>
    </View>
  );
}

function SkeletonLines() {
  return (
    <View style={styles.skeletonBlock}>
      <View style={styles.skeletonLineWide} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLineShort} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();
  const screenScrollRef = useRef<ScrollView>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [rider, setRider] = useState<Rider | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showInvoice, setShowInvoice] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [ticketSuccessMessage, setTicketSuccessMessage] = useState<string | null>(null);
  const [profileImageUpdated, setProfileImageUpdated] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [issue, setIssue] = useState('');
  const [toast, setToast] = useState('');
  const [expoPushToken, setExpoPushToken] = useState('');
  const [notification, setNotification] = useState<Notifications.Notification>();
  const [pendingNotification, setPendingNotification] = useState<Notifications.Notification | null>(null);
  const [isSendingNotification, setIsSendingNotification] = useState(false);

  const activeTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'Under Review').length,
    [tickets],
  );
  const resolvedTickets = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'Completed').length,
    [tickets],
  );
  const recentTicket = tickets[0];
  const assignedVehicleRecord = vehicles.find((vehicle) => vehicle.id === rider?.vehicleId);
  const assignedVehicle = assignedVehicleRecord?.modelName || 'No vehicle assigned';
  const assignedPlate = assignedVehicleRecord?.plateNumber || 'Not assigned';
  const oilChangeStatus = getOilChangeStatus(assignedVehicleRecord?.lastOilChangeDate);

  const showMessage = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  };

  const { width: windowWidth } = useWindowDimensions();
  const sidePad = windowWidth < 360 ? 14 : 20;
  const headerLeftInset = sidePad + insets.left;
  const headerRightInset = sidePad + insets.right;
  const bottomInset = 12 + insets.bottom;
  const navHeight = 72 + Math.max(insets.bottom, 8);
  const keyboardVerticalOffset = Platform.OS === 'ios' ? insets.top : 0;

  const scrollFocusedInputIntoView = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        screenScrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    });
  };

  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const subscription = Keyboard.addListener(event, scrollFocusedInputIntoView);
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      requestAnimationFrame(() => {
        screenScrollRef.current?.scrollTo({ y: 0, animated: true });
      });
    });
    return () => {
      subscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      console.warn('Expo push token is unavailable on Web. Open the app in an Android or iOS development build.');
      return undefined;
    }

    registerForPushNotificationsAsync()
      .then((token) => {
        console.log('Push token:', token ?? '');
        setExpoPushToken(token ?? '');
      })
      .catch((error: unknown) => console.error('Unable to register for push notifications:', error));

    const notificationListener = Notifications.addNotificationReceivedListener((receivedNotification) => {
      setNotification(receivedNotification);
    });
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      setNotification(response.notification);
      setPendingNotification(response.notification);
    });
    const tokenListener = Notifications.addPushTokenListener((token) => {
      if (typeof token.data === 'string') setExpoPushToken(token.data);
    });
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse?.notification) {
      setPendingNotification(lastResponse.notification);
    }

    return () => {
      notificationListener.remove();
      responseListener.remove();
      tokenListener.remove();
    };
  }, []);

  useEffect(() => {
    if (!rider || !expoPushToken || rider.expoPushToken === expoPushToken) return;

    updateDoc(doc(db, 'riders', rider.id), { expoPushToken })
      .then(() => setRider((current) => current ? { ...current, expoPushToken } : current))
      .catch((error) => console.error('Unable to save rider push token:', error));
  }, [rider, expoPushToken]);

  useEffect(() => {
    if (!rider?.id) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'riders', rider.id), (snapshot) => {
      if (!snapshot.exists()) return;
      const latestRider = { id: snapshot.id, ...snapshot.data() } as Rider;
      setRider(latestRider);
      setUsername(latestRider.fullName || latestRider.username || 'Rider');
      AsyncStorage.setItem(RIDER_CACHE_KEY, JSON.stringify(latestRider)).catch((error) => {
        console.error('Unable to cache latest rider information:', error);
      });
    }, (error) => {
      console.error('Unable to listen for rider updates:', error);
    });

    return unsubscribe;
  }, [rider?.id]);

  useEffect(() => {
    const restoreSession = async () => {
      let restoredFromCache = false;
      try {
        const [savedRiderId, cachedRiderJson, savedProfileImage] = await AsyncStorage.multiGet([
          RIDER_SESSION_KEY,
          RIDER_CACHE_KEY,
          RIDER_PROFILE_IMAGE_KEY,
        ]).then((entries) => entries.map(([, value]) => value));
        if (savedProfileImage) setProfileImageUri(savedProfileImage);
        if (!savedRiderId) return;

        const cachedRider = cachedRiderJson ? JSON.parse(cachedRiderJson) as Rider : null;
        if (cachedRider?.id === savedRiderId) {
          restoredFromCache = true;
          setRider(cachedRider);
          setUsername(cachedRider.fullName || cachedRider.username || 'Rider');
          setIsLoggedIn(true);
          setIsSessionReady(true);
        }

        const riderSnapshot = await getDoc(doc(db, 'riders', savedRiderId));
        if (!riderSnapshot.exists()) {
          await AsyncStorage.removeItem(RIDER_SESSION_KEY);
          return;
        }

        const savedRider = { id: riderSnapshot.id, ...riderSnapshot.data() } as Rider;
        setRider(savedRider);
        setUsername(savedRider.fullName || savedRider.username || 'Rider');
        setIsLoggedIn(true);
        await AsyncStorage.setItem(RIDER_CACHE_KEY, JSON.stringify(savedRider));
      } catch (error) {
        console.error('Unable to restore rider session:', error);
        if (!restoredFromCache) await AsyncStorage.removeItem(RIDER_SESSION_KEY);
      } finally {
        setIsSessionReady(true);
      }
    };

    restoreSession();
  }, []);

  useEffect(() => {
    if (!rider) {
      setTickets([]);
      setVehicles([]);
      return undefined;
    }

    let isActive = true;
    const restoreCachedData = async () => {
      const [cachedTicketsJson, cachedVehiclesJson] = await AsyncStorage.multiGet([
        RIDER_TICKETS_CACHE_KEY,
        RIDER_VEHICLES_CACHE_KEY,
      ]).then((entries) => entries.map(([, value]) => value));

      if (!isActive) return;
      try {
        if (cachedTicketsJson) setTickets(JSON.parse(cachedTicketsJson) as Ticket[]);
        if (cachedVehiclesJson) setVehicles(JSON.parse(cachedVehiclesJson) as Vehicle[]);
        if (cachedTicketsJson || cachedVehiclesJson) setIsLoading(false);
      } catch (error) {
        console.error('Unable to restore cached rider data:', error);
      }
    };
    restoreCachedData();

    setIsLoading(true);
    const unsubscribeTickets = onSnapshot(collection(db, 'tickets'), (snapshot) => {
      const riderTickets = snapshot.docs
        .map((ticketDoc) => {
          const data = ticketDoc.data();
          const createdAt = data.createdAt?.toDate?.() as Date | undefined;
          return {
            id: ticketDoc.id,
            category: data.category || 'General',
            issue: data.issueTitle || data.description || 'Service request',
            cost: Number(data.cost) || 0,
            status: (data.status || 'Under Review') as TicketStatus,
            date: createdAt ? createdAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recently',
            vehicle: data.vehicle || '',
            plateNumber: data.plateNumber || '',
            invoiceId: data.invoiceId || '',
            invoiceNumber: data.invoiceNumber || '',
            riderUid: data.riderUid || '',
            createdAt: createdAt?.getTime() || 0,
          };
        })
        .filter((ticket) => ticket.riderUid === rider.id)
        .sort((first, second) => second.createdAt - first.createdAt);

      setTickets(riderTickets);
  AsyncStorage.setItem(RIDER_TICKETS_CACHE_KEY, JSON.stringify(riderTickets)).catch((error) => console.error('Unable to cache tickets:', error));
      setIsLoading(false);
    }, () => {
      setIsLoading(false);
      showMessage('Unable to load service tickets.');
    });

    const handleVehicleError = (error: Error) => {
      console.error('Unable to load assigned vehicle:', error);
      showMessage('Unable to load vehicle information.');
    };

    const cacheVehicles = (nextVehicles: Vehicle[]) => {
      setVehicles(nextVehicles);
      AsyncStorage.setItem(RIDER_VEHICLES_CACHE_KEY, JSON.stringify(nextVehicles)).catch((error) => console.error('Unable to cache vehicles:', error));
    };

    const unsubscribeVehicles = rider.vehicleId
      ? onSnapshot(doc(db, 'vehicles', rider.vehicleId), (snapshot) => {
          cacheVehicles(snapshot.exists() ? [{ id: snapshot.id, ...snapshot.data() } as Vehicle] : []);
        }, handleVehicleError)
      : onSnapshot(collection(db, 'vehicles'), (snapshot) => {
          cacheVehicles(snapshot.docs.map((vehicleDoc) => ({ id: vehicleDoc.id, ...vehicleDoc.data() } as Vehicle)));
        }, handleVehicleError);

    return () => {
      isActive = false;
      unsubscribeTickets();
      unsubscribeVehicles();
    };
  }, [rider?.id, rider?.vehicleId]);

  const login = async () => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      showMessage('Enter a username to continue.');
      return;
    }

    setIsLoading(true);
    try {
      const riderSnapshot = await getDocs(collection(db, 'riders'));
      const matchedRider = riderSnapshot.docs
        .map((riderDoc) => ({ id: riderDoc.id, ...riderDoc.data() } as Rider))
        .find((candidate) => candidate.username?.toLowerCase() === trimmedUsername.toLowerCase());

      if (!matchedRider) {
        const cachedRiderJson = await AsyncStorage.getItem(RIDER_CACHE_KEY);
        const cachedRider = cachedRiderJson ? JSON.parse(cachedRiderJson) as Rider : null;
        if (!cachedRider || cachedRider.username?.toLowerCase() !== trimmedUsername.toLowerCase()) {
          showMessage('Rider account not found. Contact your administrator.');
          return;
        }
        setRider(cachedRider);
        setUsername(cachedRider.fullName || cachedRider.username || trimmedUsername);
        setIsLoggedIn(true);
        await AsyncStorage.setItem(RIDER_SESSION_KEY, cachedRider.id);
        return;
      }

      setRider(matchedRider);
      setUsername(matchedRider.fullName || matchedRider.username || trimmedUsername);
      setIsLoggedIn(true);
      await AsyncStorage.setItem(RIDER_SESSION_KEY, matchedRider.id);
      await AsyncStorage.setItem(RIDER_CACHE_KEY, JSON.stringify(matchedRider));
    } catch {
      showMessage('Unable to connect to the service.');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem(RIDER_SESSION_KEY);
    await AsyncStorage.removeItem(RIDER_CACHE_KEY);
    await AsyncStorage.removeItem(RIDER_TICKETS_CACHE_KEY);
    await AsyncStorage.removeItem(RIDER_VEHICLES_CACHE_KEY);
    await AsyncStorage.removeItem(RIDER_PROFILE_IMAGE_KEY);
    setRider(null);
    setProfileImageUri(null);
    setIsLoggedIn(false);
    setUsername('');
    setActiveTab('dashboard');
    showMessage('Logged out successfully.');
  };

  const chooseProfileImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showMessage('Photo library permission is required to choose a profile image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85
    });

    if (result.canceled || !result.assets[0]?.uri) return;
    const uri = result.assets[0].uri;
    await AsyncStorage.setItem(RIDER_PROFILE_IMAGE_KEY, uri);
    setProfileImageUri(uri);
    setProfileImageUpdated(true);
  };

  const submitTicket = async () => {
    if (categories.length === 0 || !issue.trim()) {
      showMessage('Choose at least one problem category and describe the issue.');
      return;
    }

    if (!rider) {
      showMessage('Please sign in again.');
      return;
    }

    try {
      const ticketRef = await addDoc(collection(db, 'tickets'), {
        riderUid: rider.id,
        riderName: rider.fullName || rider.username || username,
        vehicle: assignedVehicle,
        plateNumber: assignedPlate,
        category: categories.join(', '),
        issueTitle: issue.trim(),
        description: issue.trim(),
        cost: 0,
        status: 'Under Review',
        createdAt: serverTimestamp(),
      });
      setCategories([]);
      setIssue('');
      setActiveTab('dashboard');
      setTicketSuccessMessage(`Ticket #${ticketRef.id} submitted successfully.`);
    } catch {
      showMessage('Unable to submit the ticket.');
    }
  };

  const sendTestNotification = async () => {
    if (!expoPushToken) {
      showMessage('Push notifications are not ready on this device.');
      return;
    }

    setIsSendingNotification(true);
    try {
      await sendPushNotification(expoPushToken);
      showMessage('Test notification sent.');
    } catch {
      showMessage('Unable to send the test notification.');
    } finally {
      setIsSendingNotification(false);
    }
  };

  const openInvoice = async (ticketId: string, invoiceId?: string) => {
    const invoiceSnapshot = await getDoc(doc(db, 'invoices', invoiceId || ticketId));
    if (!invoiceSnapshot.exists()) {
      showMessage('Invoice is not available yet.');
      return;
    }
    setSelectedInvoice({ id: invoiceSnapshot.id, ...invoiceSnapshot.data() } as Invoice);
    setShowInvoice(true);
  };

  useEffect(() => {
    if (!pendingNotification) return;

    const data = pendingNotification.request.content.data as Record<string, unknown> | undefined;
    if (data?.type === 'ticket-completed' && typeof data.ticketId === 'string') {
      setActiveTab('history');
      void openInvoice(data.ticketId, typeof data.invoiceId === 'string' ? data.invoiceId : undefined);
    }
    setPendingNotification(null);
  }, [pendingNotification]);

  const downloadInvoice = async () => {
    if (!selectedInvoice) return;
    try {
      const html = createInvoiceHtml(selectedInvoice);
      if (Platform.OS === 'web') {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${selectedInvoice.invoiceNumber}.html`;
        link.click();
        URL.revokeObjectURL(url);
        showMessage('Invoice downloaded.');
        return;
      }

      const pdf = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdf.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Save ${selectedInvoice.invoiceNumber}`,
          UTI: 'com.adobe.pdf'
        });
      } else {
        showMessage('PDF created, but sharing is unavailable on this device.');
      }
    } catch (error) {
      console.error('Unable to download invoice:', error);
      showMessage('Unable to download the invoice.');
    }
  };

  const navItems: { id: Tab; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { id: 'dashboard', label: 'Home', icon: 'home-variant-outline' },
    { id: 'ticket', label: 'Request', icon: 'ticket-outline' },
    { id: 'history', label: 'Tickets', icon: 'clipboard-text-clock-outline' },
    { id: 'profile', label: 'Profile', icon: 'account-outline' },
  ];

  if (!isSessionReady) {
    return (
      <View style={[styles.loginScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <StatusBar style="light" />
        <View style={styles.startupLoader}>
          <Image source={require('./assets/icon.png')} style={styles.loaderLogo} />
          <View style={styles.loaderRing}>
            <ActivityIndicator size="large" color="#e4f7f2" />
          </View>
          <Text style={styles.loaderBrand}>Diana Service</Text>
          <Text style={styles.loaderMessage}>Preparing your rider portal</Text>
        </View>
      </View>
    );
  }

  if (!isLoggedIn) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <View style={[styles.loginScreen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16), paddingLeft: headerLeftInset, paddingRight: headerRightInset }]}>
          <StatusBar style="light" />
          <ScrollView
            ref={screenScrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={styles.loginScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.loginBackdropTop}><View style={styles.loginBackdropCircle} /></View>
            <View style={styles.loginCard}>
              <View style={styles.loginBrandRow}>
                <View style={styles.brandMark}>
                  <Image source={require('./assets/icon.png')} style={styles.loginBrandImage} />
                </View>
                <View>
                  <Text style={styles.loginBrand}>Diana Service</Text>
                  <Text style={styles.loginBrandMuted}>Logistics</Text>
                </View>
              </View>
              <View style={styles.loginDivider} />
              <Text style={styles.loginEyebrow}>RIDER ACCESS</Text>
              <Text style={styles.loginTitle}>Welcome back</Text>
              <Text style={styles.loginSubtitle}>Sign in to your service desk, vehicle records, and rider account.</Text>
              <View style={styles.loginFormBlock}>
                <Text style={[styles.inputLabel, styles.inputLabelFirst]}>Username</Text>
                <View style={styles.loginInputWrap}>
                  <MaterialCommunityIcons name="account-outline" size={20} color="#0f766e" />
                  <TextInput
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter your username"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    style={styles.loginInput}
                    onFocus={scrollFocusedInputIntoView}
                    returnKeyType="done"
                    onSubmitEditing={login}
                  />
                </View>
                <Text style={styles.helperText}>Use the username created by your fleet administrator.</Text>
                <SoftPressable style={[styles.primaryButton, styles.loginButton]} onPress={login} disabled={isLoading}>
                  {isLoading ? <ActivityIndicator size="small" color="#fff" /> : (
                    <>
                      <Text style={styles.primaryButtonText}>Sign in to portal</Text>
                      <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
                    </>
                  )}
                </SoftPressable>
              </View>
              <View style={styles.loginFooter}>
                <MaterialCommunityIcons name="shield-check-outline" size={15} color="#0f766e" />
                <Text style={styles.loginFooterText}>Secure access for authorized Diana riders</Text>
              </View>
            </View>
          </ScrollView>
          {toast ? <Toast message={toast} offset={bottomInset} /> : null}
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <View style={[styles.statusShell, { paddingTop: insets.top }]}>
      <View style={styles.appScreen}>
        <StatusBar style="light" />
        <ScrollView
          ref={screenScrollRef}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: navHeight + 24 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.header, { paddingLeft: headerLeftInset, paddingRight: headerRightInset }]}>
            <View style={styles.headerRow}>
              <View style={styles.headerIdentity}>
                <Image source={require('./assets/icon.png')} style={styles.headerLogo} />
                <View style={styles.headerCopy}>
                  <Text style={styles.headerEyebrow}>Diana Rider</Text>
                  <Text style={styles.headerName} numberOfLines={1}>{username}</Text>
                  <Text style={styles.headerMeta} numberOfLines={1}>ID  {rider?.id || 'Loading'}</Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <SoftPressable style={styles.headerButton} onPress={logout} accessibilityLabel="Log out" hitSlop={8}>
                  <MaterialCommunityIcons name="logout-variant" size={20} color="#e4f7f2" />
                </SoftPressable>
              </View>
            </View>
            <View style={styles.vehicleBanner}>
              <View style={styles.vehicleIcon}>
                <MaterialCommunityIcons name="motorbike" size={22} color="#0f766e" />
              </View>
              <View style={styles.vehicleCopy}>
                <Text style={styles.vehicleLabel}>Assigned vehicle</Text>
                <Text style={styles.vehicleName} numberOfLines={1}>{assignedVehicle}</Text>
                <Text style={styles.vehiclePlate}>{assignedPlate}</Text>
              </View>
              <Text style={styles.activePill}>{assignedVehicleRecord?.status || 'Active'}</Text>
            </View>
          </View>

          <View style={{ paddingHorizontal: headerLeftInset - insets.left, paddingRight: headerRightInset - insets.right }}>
            <ScreenFade id={activeTab}>
              {activeTab === 'dashboard' ? (
                <Dashboard greetingName={username} activeTickets={activeTickets} resolvedTickets={resolvedTickets} recentTicket={recentTicket} oilChangeStatus={oilChangeStatus} isLoading={isLoading} onNewTicket={() => setActiveTab('ticket')} onHistory={() => setActiveTab('history')} />
              ) : null}
              {activeTab === 'ticket' ? (
                <TicketForm categories={categories} issue={issue} vehicle={assignedVehicle} plate={assignedPlate} onCategories={setCategories} onIssue={setIssue} onSubmit={submitTicket} onInputFocus={scrollFocusedInputIntoView} />
              ) : null}
              {activeTab === 'history' ? <History tickets={tickets} isLoading={isLoading} onInvoice={(ticket) => openInvoice(ticket.id, ticket.invoiceId)} /> : null}
              {activeTab === 'profile' ? <Profile rider={rider} vehicle={assignedVehicleRecord} profileImageUri={profileImageUri} expoPushToken={expoPushToken} notification={notification} isSendingNotification={isSendingNotification} onChooseImage={chooseProfileImage} onSendNotification={sendTestNotification} onLogout={logout} /> : null}
            </ScreenFade>
          </View>
        </ScrollView>

        <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8), paddingLeft: insets.left, paddingRight: insets.right }]}>
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <Pressable
                key={item.id}
                style={[styles.navItem, active && styles.activeNavItem]}
                onPress={() => setActiveTab(item.id)}
                accessibilityLabel={item.label}
                android_ripple={{ color: '#d7ece8', borderless: true }}
              >
                <MaterialCommunityIcons name={item.icon} size={22} color={active ? '#fff' : '#647779'} />
                <Text style={[styles.navLabel, active && styles.activeNavText]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

      <Modal visible={Boolean(ticketSuccessMessage)} transparent animationType="fade" onRequestClose={() => setTicketSuccessMessage(null)}>
        <View style={styles.successModalBackdrop}>
          <View style={styles.successModalCard}>
            <View style={styles.successIcon}><MaterialCommunityIcons name="check-bold" size={28} color="#fff" /></View>
            <Text style={styles.successModalEyebrow}>SERVICE DESK</Text>
            <Text style={styles.successModalTitle}>Ticket submitted</Text>
            <Text style={styles.successModalMessage}>{ticketSuccessMessage}</Text>
            <Text style={styles.successModalHint}>Your request is now under review. You can track its progress from Home.</Text>
            <SoftPressable style={styles.successModalButton} onPress={() => setTicketSuccessMessage(null)}>
              <Text style={styles.successModalButtonText}>Continue</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
            </SoftPressable>
          </View>
        </View>
      </Modal>

      <Modal visible={profileImageUpdated} transparent animationType="fade" onRequestClose={() => setProfileImageUpdated(false)}>
        <View style={styles.successModalBackdrop}>
          <View style={styles.successModalCard}>
            <View style={styles.successIcon}><MaterialCommunityIcons name="check-bold" size={28} color="#fff" /></View>
            <Text style={styles.successModalEyebrow}>ACCOUNT UPDATED</Text>
            <Text style={styles.successModalTitle}>Profile image updated</Text>
            <Text style={styles.successModalHint}>Your new profile image has been saved on this device.</Text>
            <SoftPressable style={styles.successModalButton} onPress={() => setProfileImageUpdated(false)}>
              <Text style={styles.successModalButtonText}>Continue</Text>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
            </SoftPressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showInvoice} transparent animationType="slide" onRequestClose={() => setShowInvoice(false)}>
        <View style={[styles.modalBackdrop, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          <ScrollView style={styles.invoiceScroll} contentContainerStyle={styles.invoiceScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.invoiceCard}>
              <View style={styles.invoiceHeader}>
                <Text style={styles.cardTitle}>Service invoice</Text>
                <View style={styles.invoiceActions}>
                  <SoftPressable onPress={downloadInvoice} style={styles.downloadButton}>
                    <MaterialCommunityIcons name="download" size={16} color="#fff" />
                    <Text style={styles.downloadButtonText}>Download</Text>
                  </SoftPressable>
                  <Pressable onPress={() => setShowInvoice(false)} hitSlop={8} style={styles.closeButton}>
                    <Text style={styles.closeText}>Close</Text>
                  </Pressable>
                </View>
              </View>
              {selectedInvoice ? <>
                <View style={styles.invoiceBrandRow}>
                  <View style={styles.invoiceBrandLine}>
                    <Image source={require('./assets/icon.png')} style={styles.invoiceBrandLogo} />
                    <View style={styles.invoiceBrandCopy}>
                      <Text style={styles.invoiceCompany}>Diana Service Logistics</Text>
                      <Text style={styles.invoiceSubtitle}>Official maintenance & service</Text>
                    </View>
                  </View>
                  <View style={styles.invoiceHeaderMeta}>
                    <Text style={styles.invoiceTitle}>INVOICE</Text>
                    <Text style={styles.invoiceMeta}>Invoice No: {selectedInvoice.invoiceNumber}</Text>
                    <Text style={styles.invoiceDate}>Date: {formatInvoiceDate(selectedInvoice.completionDate)}</Text>
                  </View>
                </View>
                <View style={styles.invoiceDetailsRow}>
                  <View style={styles.invoiceDetailsColumn}>
                    <Text style={styles.invoiceSectionTitle}>RIDER INFORMATION</Text>
                    <Text style={styles.invoiceValueLarge}>{selectedInvoice.riderName}</Text>
                    <Text style={styles.invoiceDetailText}>Rider ID: {selectedInvoice.riderId}</Text>
                    <Text style={styles.invoiceDetailText}>Phone: {selectedInvoice.riderPhone || 'Not available'}</Text>
                  </View>
                  <View style={styles.invoiceDetailsColumn}>
                    <Text style={styles.invoiceSectionTitle}>VEHICLE SPECIFICATIONS</Text>
                    <Text style={styles.invoiceValueLarge}>{selectedInvoice.vehicleName}</Text>
                    <Text style={styles.invoiceDetailText}>Plate No: {selectedInvoice.plateNumber}</Text>
                    <Text style={styles.invoiceDetailText}>Ticket Ref: #{selectedInvoice.ticketId}</Text>
                  </View>
                </View>
                <Text style={styles.invoiceBreakdownHeading}>Service breakdown & cost summary</Text>
                <View style={styles.invoiceBreakdown}>
                  <View style={styles.invoiceTableHeader}>
                    <Text style={styles.invoiceTableHeaderText}>Category</Text>
                    <Text style={styles.invoiceTableHeaderText}>Work details</Text>
                    <Text style={styles.invoiceTableHeaderText}>Cost (SAR)</Text>
                  </View>
                  <View style={styles.invoiceTableRow}>
                    <Text style={styles.invoiceTableCategory}>{selectedInvoice.serviceCategory}</Text>
                    <View style={styles.invoiceTableDescription}>
                      <Text style={styles.invoiceValue}>{selectedInvoice.issueTitle}</Text>
                      <Text style={styles.invoiceDescription}>{selectedInvoice.description}</Text>
                    </View>
                    <Text style={styles.invoiceCost}>{selectedInvoice.subtotal.toFixed(2)}</Text>
                  </View>
                  {selectedInvoice.additionalCharges > 0 ? (
                    <View style={styles.invoiceTableRow}>
                      <Text style={styles.invoiceTableCategory}>Additional charges</Text>
                      <Text style={styles.invoiceDescription}>Service-related charges</Text>
                      <Text style={styles.invoiceCost}>{selectedInvoice.additionalCharges.toFixed(2)}</Text>
                    </View>
                  ) : null}
                  <View style={styles.invoiceTotal}>
                    <Text style={styles.invoiceTotalLabel}>Total approved</Text>
                    <Text style={styles.invoiceTotalValue}>{selectedInvoice.totalAmount.toFixed(2)} SAR</Text>
                  </View>
                </View>
                <View style={styles.invoicePaymentRow}>
                  <Text style={styles.invoicePayment}>Payment: {selectedInvoice.status}</Text>
                  <Text style={styles.invoiceDate}>Completed: {formatInvoiceDate(selectedInvoice.completionDate)}</Text>
                </View>
                <Text style={styles.invoiceFooter}>Diana Service Logistics · Maintenance & Service Center · Ticket #{selectedInvoice.ticketId}</Text>
              </> : (
                <EmptyState icon="file-document-outline" title="Invoice unavailable" message="This invoice could not be loaded." />
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
      {toast ? <Toast message={toast} offset={bottomInset} /> : null}
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Dashboard({ greetingName, activeTickets, resolvedTickets, recentTicket, oilChangeStatus, isLoading, onNewTicket, onHistory }: { greetingName: string; activeTickets: number; resolvedTickets: number; recentTicket?: Ticket; oilChangeStatus: { label: string; tone: 'neutral' | 'urgent' | 'soon' | 'good' }; isLoading: boolean; onNewTicket: () => void; onHistory: () => void }) {
  const firstName = greetingName.split(' ')[0] || greetingName;

  return (
    <View style={styles.content}>
      <View style={styles.pageIntro}>
        <Text style={styles.pageKicker}>DASHBOARD</Text>
        <Text style={styles.pageHeading}>Good to see you, {firstName}</Text>
        <Text style={styles.pageDescription}>Keep service requests moving and stay ahead of vehicle care.</Text>
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Active tickets" value={activeTickets} tone="amber" />
        <StatCard label="Resolved tickets" value={resolvedTickets} tone="green" />
      </View>
      <SoftPressable style={styles.primaryButton} onPress={onNewTicket}>
        <MaterialCommunityIcons name="plus" size={18} color="#fff" />
        <Text style={styles.primaryButtonText}>Open new service ticket</Text>
      </SoftPressable>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Recent service ticket</Text>
          {recentTicket ? (
            <Pressable onPress={onHistory} hitSlop={8}>
              <Text style={styles.linkText}>View all</Text>
            </Pressable>
          ) : null}
        </View>
        {isLoading && !recentTicket ? (
          <SkeletonLines />
        ) : recentTicket ? (
          <TicketSummary ticket={recentTicket} />
        ) : (
          <EmptyState icon="ticket-outline" title="No tickets yet" message="Submit a service request when your vehicle needs attention." />
        )}
      </View>
      <View style={[styles.oilCard, oilChangeStatus.tone === 'urgent' && styles.oilCardUrgent, oilChangeStatus.tone === 'soon' && styles.oilCardSoon]}>
        <View style={styles.oilIcon}><MaterialCommunityIcons name="oil" size={24} color="#b7791f" /></View>
        <View style={styles.oilCopy}>
          <Text style={styles.oilEyebrow}>VEHICLE CARE</Text>
          <Text style={styles.oilTitle}>Oil change schedule</Text>
          <Text style={styles.oilStatus}>{oilChangeStatus.label}</Text>
        </View>
        <View style={[styles.oilIndicator, oilChangeStatus.tone === 'urgent' ? styles.oilIndicatorUrgent : oilChangeStatus.tone === 'soon' ? styles.oilIndicatorSoon : oilChangeStatus.tone === 'neutral' ? styles.oilIndicatorNeutral : styles.oilIndicatorGood]} />
      </View>
    </View>
  );
}

function TicketForm({ categories, issue, vehicle, plate, onCategories, onIssue, onSubmit, onInputFocus }: { categories: string[]; issue: string; vehicle: string; plate: string; onCategories: (value: string[]) => void; onIssue: (value: string) => void; onSubmit: () => void; onInputFocus: () => void }) {
  const toggleCategory = (option: string) => {
    onCategories(categories.includes(option) ? categories.filter((category) => category !== option) : [...categories, option]);
  };

  return (
    <View style={styles.content}>
      <View style={styles.pageIntro}>
        <Text style={styles.pageKicker}>SERVICE DESK</Text>
        <Text style={styles.pageHeading}>Create a service ticket</Text>
        <Text style={styles.pageDescription}>Tell us what needs attention and we will take it from there.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.formTitle}>Ticket details</Text>
        <Text style={[styles.inputLabel, styles.inputLabelFirst]}>Assigned vehicle</Text>
        <View style={styles.select}>
          <View>
            <Text style={styles.selectText}>{vehicle}</Text>
            <Text style={styles.selectMeta}>{plate}</Text>
          </View>
          <MaterialCommunityIcons name="motorbike" size={22} color="#0f766e" />
        </View>
        <Text style={styles.inputLabel}>Problem categories <Text style={styles.inputHint}>(select all that apply)</Text></Text>
        <View style={styles.categoryRow}>
          {categoryOptions.map((option) => {
            const selected = categories.includes(option);
            return (
              <Pressable
                key={option}
                style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                onPress={() => toggleCategory(option)}
              >
                <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.inputLabel}>Issue description</Text>
        <TextInput
          value={issue}
          onChangeText={onIssue}
          placeholder="Describe what needs attention"
          placeholderTextColor="#94a3b8"
          multiline
          style={[styles.input, styles.issueInput]}
          onFocus={onInputFocus}
        />
        <SoftPressable style={styles.primaryButton} onPress={onSubmit}>
          <Text style={styles.primaryButtonText}>Submit ticket</Text>
          <MaterialCommunityIcons name="send" size={16} color="#fff" />
        </SoftPressable>
      </View>
    </View>
  );
}

function History({ tickets, isLoading, onInvoice }: { tickets: Ticket[]; isLoading: boolean; onInvoice: (ticket: Ticket) => void }) {
  return (
    <View style={styles.content}>
      <View style={styles.pageIntro}>
        <Text style={styles.pageKicker}>RECORDS</Text>
        <Text style={styles.pageHeading}>Service history</Text>
        <Text style={styles.pageDescription}>A complete view of your maintenance requests and invoices.</Text>
      </View>
      {isLoading && tickets.length === 0 ? (
        <View style={styles.card}><SkeletonLines /></View>
      ) : tickets.length === 0 ? (
        <View style={styles.card}>
          <EmptyState icon="clipboard-text-outline" title="No service history" message="Tickets you submit will appear here with status and invoice details." />
        </View>
      ) : tickets.map((ticket) => (
        <View key={ticket.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.ticketHeading}>
              <Text style={styles.ticketId}>TICKET  #{ticket.id}</Text>
              <Text style={styles.ticketIssue}>{ticket.issue}</Text>
            </View>
            <StatusPill status={ticket.status} />
          </View>
          <View style={styles.ticketMetaRow}>
            <View style={styles.ticketMetaChip}>
              <MaterialCommunityIcons name="calendar-month-outline" size={14} color="#647779" />
              <Text style={styles.dateText}>Submitted {ticket.date}</Text>
            </View>
            <View style={styles.ticketMetaChip}>
              <MaterialCommunityIcons name="tag-outline" size={14} color="#647779" />
              <Text style={styles.dateText}>{ticket.category}</Text>
            </View>
          </View>
          <View style={styles.ticketFooter}>
            <Text style={styles.ticketVehicle}>{ticket.vehicle}{ticket.plateNumber ? `  ·  ${ticket.plateNumber}` : ''}</Text>
            <Text style={styles.costText}>{ticket.cost ? `${ticket.cost} SAR` : ticket.status}</Text>
          </View>
          {ticket.status === 'Completed' ? (
            <SoftPressable style={styles.invoiceButton} onPress={() => onInvoice(ticket)}>
              <MaterialCommunityIcons name="file-document-outline" size={16} color="#0f766e" />
              <Text style={styles.invoiceButtonText}>View invoice</Text>
            </SoftPressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Profile({ rider, vehicle, profileImageUri, expoPushToken, notification, isSendingNotification, onChooseImage, onSendNotification, onLogout }: { rider: Rider | null; vehicle?: Vehicle; profileImageUri: string | null; expoPushToken: string; notification?: Notifications.Notification; isSendingNotification: boolean; onChooseImage: () => void; onSendNotification: () => void; onLogout: () => void }) {
  const displayName = rider?.fullName || rider?.username || 'Rider';
  const salary = Number(rider?.salary) || 0;
  const vehicleName = vehicle?.modelName || 'No vehicle assigned';
  const vehiclePlate = vehicle?.plateNumber || 'Not assigned';
  const info = [
    ['Username', rider?.username || 'Not available'],
    ['Email', rider?.email || 'Not available'],
    ['Phone', rider?.phone || 'Not available'],
    ['City', rider?.city || 'Not available'],
    ['Iqama / NID', rider?.iqamaNid || 'Not available'],
    ['License No.', rider?.licenseNumber || 'Not available'],
    ['Emergency', rider?.emergencyContact || 'Not available'],
  ];

  return (
    <View style={styles.content}>
      <View style={styles.pageIntro}>
        <Text style={styles.pageKicker}>ACCOUNT</Text>
        <Text style={styles.pageHeading}>Rider profile</Text>
        <Text style={styles.pageDescription}>Your rider account, notifications, and assigned vehicle.</Text>
      </View>
      <View style={styles.profileHero}>
        <Pressable style={styles.avatar} onPress={onChooseImage}>
          {profileImageUri ? <Image source={{ uri: profileImageUri }} style={styles.profileImage} /> : <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>}
          <View style={styles.photoBadge}><MaterialCommunityIcons name="camera-outline" size={13} color="#fff" /></View>
        </Pressable>
        <View style={styles.profileHeroCopy}>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileRole}>Delivery rider</Text>
          <Text style={styles.profileId}>Rider ID  ·  {rider?.id || 'Not available'}</Text>
        </View>
      </View>
      <View style={styles.salaryCard}>
        <View style={styles.salaryRow}>
          <Text style={styles.salaryLabel}>MONTHLY SALARY</Text>
          <Text style={styles.salaryTag}>ACTIVE</Text>
        </View>
        <Text style={styles.salaryValue}>{salary.toLocaleString()} <Text style={styles.salaryCurrency}>SAR</Text></Text>
      </View>
      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>ACCOUNT INFORMATION</Text>
        <View style={styles.profileInfoGrid}>{info.map(([label, value]) => <Detail key={label} label={label} value={value} />)}</View>
      </View>
      <View style={styles.profileSection}>
        <Text style={styles.profileSectionTitle}>ASSIGNED VEHICLE</Text>
        <View style={styles.vehicleProfileHeader}>
          <View style={styles.vehicleIcon}><MaterialCommunityIcons name="motorbike" size={22} color="#0f766e" /></View>
          <View style={styles.vehicleCopy}>
            <Text style={styles.vehicleName}>{vehicleName}</Text>
            <Text style={styles.vehicleLabel}>{vehicle?.vehicleType || 'Vehicle'}  ·  {vehicle?.status || 'Active'}</Text>
          </View>
        </View>
        <View style={styles.profileInfoGrid}>
          <Detail label="Plate number" value={vehiclePlate} />
          <Detail label="Fuel type" value={vehicle?.fuelType || 'Not available'} />
          <Detail label="Odometer" value={vehicle?.currentOdo !== undefined ? `${vehicle.currentOdo} km` : 'Not available'} />
        </View>
      </View>
      <SoftPressable style={styles.logoutButton} onPress={onLogout} accessibilityLabel="Log out">
        <MaterialCommunityIcons name="logout-variant" size={18} color="#bd4545" />
        <Text style={styles.logoutButtonText}>Log out</Text>
      </SoftPressable>
    </View>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'green' }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTopLine}>
        <Text style={styles.statLabel}>{label}</Text>
        <View style={[styles.statMark, tone === 'green' && styles.greenMark]}>
          <Text style={[styles.statMarkText, tone === 'green' && styles.greenMarkText]}>{tone === 'green' ? 'OK' : '!'}</Text>
        </View>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statCaption}>{tone === 'green' ? 'Successfully closed' : 'Awaiting attention'}</Text>
    </View>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: TicketStatus }) {
  const tone = status === 'Completed' ? styles.completedPill : status === 'Rejected' ? styles.rejectedPill : status === 'Approved' ? styles.approvedPill : styles.reviewPill;
  return <Text style={[styles.statusPill, tone]}>{status}</Text>;
}

function TicketSummary({ ticket }: { ticket: Ticket }) {
  return (
    <View style={styles.summary}>
      <View style={styles.summaryMark}>
        <MaterialCommunityIcons name="wrench-outline" size={16} color="#fff" />
      </View>
      <View style={styles.summaryCopy}>
        <View style={[styles.cardHeader, styles.ticketSummaryHeader]}>
          <Text style={styles.ticketTitle} numberOfLines={1}>Ticket #{ticket.id}</Text>
          <StatusPill status={ticket.status} />
        </View>
        <Text style={styles.summaryIssue}>{ticket.issue}</Text>
        <Text style={styles.summaryMeta}>{ticket.category}  ·  {ticket.date}</Text>
      </View>
    </View>
  );
}

function Toast({ message, offset = 12 }: { message: string; offset?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(10);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
    ]).start();
  }, [message, opacity, translateY]);

  return (
    <Animated.View style={[styles.toast, { bottom: 84 + offset, opacity, transform: [{ translateY }] }]}>
      <MaterialCommunityIcons name="information-outline" size={18} color="#fff" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  statusShell: { flex: 1, backgroundColor: '#0f766e' },
  loginScrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  loaderLogo: { width: 72, height: 72, borderRadius: 20, marginBottom: 18 },
  headerIdentity: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 12 },
  headerLogo: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#fff' },
  headerCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  headerEyebrow: { color: '#b7ebe3', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  vehiclePlate: { color: '#829296', fontSize: 11, marginTop: 2, fontWeight: '600' },
  inputLabelFirst: { marginTop: 0 },
  emptyState: { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 12 },
  emptyStateIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#e7f6f2', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyStateTitle: { color: '#10252a', fontSize: 16, fontWeight: '700' },
  emptyStateMessage: { color: '#718286', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 280 },
  skeletonBlock: { marginTop: 16, gap: 8 },
  skeletonLineWide: { height: 12, borderRadius: 8, backgroundColor: '#e7eeec', width: '88%' },
  skeletonLine: { height: 12, borderRadius: 8, backgroundColor: '#eef3f2', width: '70%' },
  skeletonLineShort: { height: 12, borderRadius: 8, backgroundColor: '#f3f7f6', width: '42%' },
  ticketHeading: { flex: 1, minWidth: 0 },
  ticketMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  ticketMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#f6faf9', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  ticketVehicle: { color: '#647779', fontSize: 12, flex: 1, paddingRight: 8 },
  summaryMeta: { color: '#829296', fontSize: 11, marginTop: 6, fontWeight: '600' },
  approvedPill: { backgroundColor: '#e5f3ff', color: '#0369a1' },
  notificationStatusCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, padding: 12, marginTop: 10 },
  notificationReady: { backgroundColor: '#eef8f5' },
  notificationPending: { backgroundColor: '#fff8e8' },
  notificationEmpty: { color: '#94a1a4', fontSize: 12, marginTop: 10 },
  logoutButton: { borderColor: '#f0c9c9', backgroundColor: '#fff7f7', borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50 },
  logoutButtonText: { color: '#bd4545', fontWeight: '700', fontSize: 14 },
  invoiceBrandLogo: { width: 42, height: 42, borderRadius: 12 },
  invoiceBrandCopy: { flex: 1 },
  closeButton: { paddingHorizontal: 8, paddingVertical: 8 },
  statMarkText: { color: '#b7791f', fontSize: 10, fontWeight: '800' },
  greenMarkText: { color: '#0369a1' },
  loginScreen: { flex: 1, backgroundColor: '#10252a', justifyContent: 'center', overflow: 'hidden' },
  startupLoader: { alignItems: 'center', justifyContent: 'center' },
  loaderRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: '#3d706f', backgroundColor: '#174149', alignItems: 'center', justifyContent: 'center' },
  loaderBrand: { color: '#e4f7f2', fontSize: 18, fontWeight: '800', marginTop: 18 },
  loaderMessage: { color: '#a9ddd3', fontSize: 12, marginTop: 7, letterSpacing: 0.4 },
  loginBackdropTop: { position: 'absolute', top: -155, right: -110, width: 330, height: 330, borderRadius: 165, backgroundColor: '#174149', opacity: 0.9 },
  loginBackdropCircle: { position: 'absolute', bottom: 28, left: 28, width: 120, height: 120, borderRadius: 50, borderWidth: 1, borderColor: '#3d706f', opacity: 0.5 },
  loginCard: { backgroundColor: '#fff', borderRadius: 28, padding: 24, shadowColor: '#071619', shadowOpacity: 0.34, shadowRadius: 26, elevation: 10 },
  loginBrandRow: { flexDirection: 'row', alignItems: 'center' },
  brandMark: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#dbe7e4' },
  loginBrandImage: { width: 44, height: 44, borderRadius: 14 },
  loginBrand: { color: '#10252a', fontSize: 18, fontWeight: '800', marginLeft: 12 },
  loginBrandMuted: { color: '#0f766e', fontSize: 12, fontWeight: '700', marginLeft: 12, marginTop: 2, letterSpacing: 1.2 },
  loginDivider: { height: 1, backgroundColor: '#e5eeec', marginTop: 22, marginBottom: 22 },
  loginTitle: { color: '#10252a', fontSize: 30, fontWeight: '800', letterSpacing: -0.7, textAlign: 'center' },
  loginSubtitle: { color: '#708286', fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 20, textAlign: 'center' },
  loginEyebrow: { color: '#0f766e', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, textAlign: 'center' },
  loginFormBlock: { backgroundColor: '#f8fbfa', borderColor: '#e2eeeb', borderWidth: 1, borderRadius: 18, padding: 16 },
  inputLabel: { color: '#29434a', fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 16 },
  inputHint: { color: '#94a3b8', fontSize: 10, fontWeight: '600' },
  input: { backgroundColor: '#f6faf9', borderColor: '#d6e4e1', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 14, color: '#183238', fontSize: 15, minHeight: 52 },
  loginInputWrap: { backgroundColor: '#fff', borderColor: '#d6e4e1', borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  loginInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 12, color: '#183238', fontSize: 15 },
  helperText: { color: '#829296', fontSize: 12, lineHeight: 17, marginTop: 8 },
  primaryButton: { backgroundColor: '#0f766e', borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, minHeight: 52, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18, shadowColor: '#0f766e', shadowOpacity: 0.22, shadowRadius: 8, elevation: 3 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  loginButton: { marginTop: 18 },
  loginFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, gap: 6 },
  loginFooterText: { color: '#829296', fontSize: 11 },
  appScreen: { flex: 1, backgroundColor: '#f3f7f6' },
  scrollContent: { paddingBottom: 108 },
  header: { width: '100%', alignSelf: 'stretch', backgroundColor: '#0f766e', borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingVertical: 18, shadowColor: '#064e49', shadowOpacity: 0.22, shadowRadius: 14, elevation: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerName: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2, letterSpacing: -0.4 },
  headerMeta: { color: '#c6e7e2', fontSize: 12, marginTop: 3, fontWeight: '600' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerButton: { backgroundColor: '#176d68', borderColor: '#4b9b93', borderWidth: 1, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  vehicleBanner: { backgroundColor: '#fff', borderRadius: 16, marginTop: 18, padding: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#064e49', shadowOpacity: 0.08, shadowRadius: 8, elevation: 2 },
  vehicleIcon: { backgroundColor: '#e4f7f2', width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  vehicleCopy: { flex: 1, marginLeft: 12, minWidth: 0 },
  vehicleLabel: { color: '#829296', fontSize: 11, fontWeight: '700' },
  vehicleName: { color: '#183238', fontSize: 16, fontWeight: '700', marginTop: 2 },
  activePill: { color: '#fff', backgroundColor: '#0f766e', borderRadius: 20, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, fontSize: 11, fontWeight: '700' },
  content: { paddingTop: 18, paddingBottom: 8, gap: 14 },
  pageIntro: { marginBottom: 2 },
  pageKicker: { color: '#0f766e', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  pageHeading: { color: '#10252a', fontSize: 24, fontWeight: '800', letterSpacing: -0.5, marginTop: 5 },
  pageDescription: { color: '#718286', fontSize: 13, marginTop: 6, lineHeight: 19 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { backgroundColor: '#fff', borderColor: '#dbe7e4', borderWidth: 1, borderRadius: 18, padding: 16, flex: 1, minHeight: 118, shadowColor: '#173337', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  statTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statMark: { backgroundColor: '#fff4d6', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, alignSelf: 'flex-start' },
  greenMark: { backgroundColor: '#e5f3ff' },
  statLabel: { color: '#647779', fontSize: 12, fontWeight: '700' },
  statValue: { color: '#10252a', fontSize: 32, fontWeight: '800', marginTop: 14, letterSpacing: -0.8 },
  statCaption: { color: '#94a1a4', fontSize: 11, marginTop: 4, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderColor: '#dbe7e4', borderWidth: 1, borderRadius: 18, padding: 18, shadowColor: '#173337', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  cardTitle: { color: '#10252a', fontSize: 16, fontWeight: '800' },
  linkText: { color: '#0f766e', fontSize: 13, fontWeight: '700' },
  summary: { flexDirection: 'row', marginTop: 14 },
  summaryMark: { backgroundColor: '#0f766e', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  summaryCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  ticketSummaryHeader: { gap: 6, alignItems: 'center' },
  ticketTitle: { flex: 1, flexShrink: 1, color: '#183238', fontSize: 14, fontWeight: '700' },
  summaryIssue: { color: '#475569', fontSize: 13, marginTop: 7, lineHeight: 19 },
  statusPill: { flexShrink: 0, fontSize: 11, fontWeight: '700', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  reviewPill: { backgroundColor: '#fff4d6', color: '#9a6814' },
  completedPill: { backgroundColor: '#dff5ef', color: '#0f766e' },
  rejectedPill: { backgroundColor: '#fee5e5', color: '#bd4545' },
  detail: { backgroundColor: '#f8fbfa', borderColor: '#dbe7e4', borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, gap: 12 },
  detailLabel: { color: '#829296', fontSize: 12, fontWeight: '700', flexShrink: 0 },
  detailValue: { color: '#29434a', fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1 },
  salaryCard: { backgroundColor: '#172126', borderRadius: 18, padding: 18 },
  salaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  salaryLabel: { color: '#c9e8ff', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  salaryTag: { color: '#fff', fontSize: 10, fontWeight: '800', backgroundColor: '#0f766e', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
  salaryValue: { color: '#fff', fontSize: 30, fontWeight: '800', marginTop: 12, letterSpacing: -0.5 },
  salaryCurrency: { color: '#9ccbc5', fontSize: 14, fontWeight: '700' },
  oilCard: { backgroundColor: '#fffdf7', borderColor: '#ead9a8', borderWidth: 1, borderRadius: 16, padding: 17, flexDirection: 'row', alignItems: 'center', shadowColor: '#b7791f', shadowOpacity: 0.1, shadowRadius: 12, elevation: 2 },
  oilCardSoon: { borderColor: '#f2c46d', backgroundColor: '#fffaf0' },
  oilCardUrgent: { borderColor: '#f0a5a5', backgroundColor: '#fff7f7' },
  oilIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#fff1c7', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f1d98e' },
  oilCopy: { flex: 1, marginLeft: 12 },
  oilEyebrow: { color: '#94a3b8', fontSize: 9, fontWeight: '400', letterSpacing: 1 },
  oilTitle: { color: '#172126', fontSize: 16, fontWeight: '700', marginTop: 3 },
  oilStatus: { color: '#64748b', fontSize: 12, fontWeight: '600', marginTop: 5 },
  oilIndicator: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: '#fff' },
  oilIndicatorGood: { backgroundColor: '#10b981' },
  oilIndicatorSoon: { backgroundColor: '#f59e0b' },
  oilIndicatorUrgent: { backgroundColor: '#ef4444' },
  oilIndicatorNeutral: { backgroundColor: '#94a3b8' },
  pageTitle: { color: '#172126', fontSize: 20, fontWeight: '800' },
  ticketId: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  ticketIssue: { color: '#1e293b', fontSize: 16, fontWeight: '700', marginTop: 5, paddingRight: 8 },
  dateText: { color: '#718286', fontSize: 12, fontWeight: '600' },
  ticketFooter: { borderTopColor: '#eef3f2', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12 },
  costText: { color: '#0f766e', fontSize: 13, fontWeight: '800' },
  formTitle: { color: '#10252a', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  select: { backgroundColor: '#f6faf9', borderColor: '#d6e4e1', borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selectText: { color: '#29434a', fontSize: 15, fontWeight: '700' },
  selectMeta: { color: '#829296', fontSize: 12, marginTop: 4, fontWeight: '600' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { borderColor: '#d0dfdc', backgroundColor: '#fff', borderWidth: 1, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 10, minHeight: 40, justifyContent: 'center' },
  categoryChipSelected: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  categoryText: { color: '#52686b', fontSize: 13, fontWeight: '700' },
  categoryTextSelected: { color: '#fff' },
  issueInput: { minHeight: 120, textAlignVertical: 'top' },
  profileHero: { backgroundColor: '#fff', borderColor: '#dbe7e4', borderWidth: 1, borderRadius: 20, padding: 22, alignItems: 'center', shadowColor: '#173337', shadowOpacity: 0.05, shadowRadius: 10, elevation: 1 },
  profileHeroCopy: { alignItems: 'center', marginTop: 16 },
  profileId: { color: '#94a1a4', fontSize: 11, marginTop: 8, fontWeight: '600' },
  profileSection: { backgroundColor: '#fff', borderColor: '#dbe7e4', borderWidth: 1, borderRadius: 18, padding: 17, shadowColor: '#173337', shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  profileSectionTitle: { color: '#0f766e', fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 4 },
  notificationStatus: { color: '#647779', fontSize: 13, lineHeight: 19, flex: 1 },
  notificationPreview: { backgroundColor: '#f6faf9', borderColor: '#dbe7e4', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  notificationTitle: { color: '#29434a', fontSize: 14, fontWeight: '700' },
  notificationBody: { color: '#718286', fontSize: 13, lineHeight: 18, marginTop: 4 },
  profileInfoGrid: { marginTop: 13 },
  vehicleProfileHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 2 },
  avatar: { backgroundColor: '#e4f7f2', width: 116, height: 116, borderRadius: 58, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#c4e8df' },
  avatarText: { color: '#0f766e', fontSize: 42, fontWeight: '800' },
  profileImage: { width: 110, height: 110, borderRadius: 55 },
  photoBadge: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#0f766e', borderColor: '#fff', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  profileName: { color: '#10252a', fontSize: 24, fontWeight: '800' },
  profileRole: { color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 5, fontWeight: '600' },
  secondaryButton: { borderColor: '#c9ddd8', backgroundColor: '#f6faf9', borderWidth: 1, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, minHeight: 50, marginTop: 16 },
  notificationButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  secondaryButtonText: { color: '#29434a', fontWeight: '700', fontSize: 14 },
  bottomNav: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120, backgroundColor: '#fff', borderTopColor: '#e2eeeb', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', paddingTop: 12, shadowColor: '#173337', shadowOpacity: 0.08, shadowRadius: 8, elevation: 8 },
  navItem: { alignItems: 'center', justifyContent: 'center', minWidth: 64, minHeight: 52, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  activeNavItem: { backgroundColor: '#0f766e' },
  navLabel: { color: '#647779', fontSize: 11, fontWeight: '700', marginTop: 3 },
  activeNavText: { color: '#fff' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', justifyContent: 'center', paddingHorizontal: 16 },
  invoiceScroll: { maxHeight: '94%' },
  invoiceScrollContent: { flexGrow: 1, paddingVertical: 8 },
  invoiceCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18 },
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottomColor: '#e2e8f0', borderBottomWidth: 1, paddingBottom: 14 },
  invoiceActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  downloadButton: { backgroundColor: '#0f766e', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  downloadButtonText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  closeText: { color: '#475569', fontWeight: '800', fontSize: 13 },
  invoiceBrandRow: { flexDirection: 'column', marginTop: 18, paddingBottom: 18, borderBottomColor: '#dbe7e4', borderBottomWidth: 1 },
  invoiceBrandLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  invoiceCompany: { color: '#10252a', fontSize: 18, fontWeight: '800' },
  invoiceSubtitle: { color: '#64748b', fontSize: 12, marginTop: 4 },
  invoiceHeaderMeta: { alignItems: 'flex-start', marginTop: 16 },
  invoiceTitle: { color: '#0f766e', fontSize: 26, fontWeight: '900', letterSpacing: 1 },
  invoiceMeta: { color: '#64748b', fontSize: 12, marginTop: 10, fontWeight: '700' },
  invoiceDate: { color: '#64748b', fontSize: 12, marginTop: 4, fontWeight: '600' },
  invoiceDetailsRow: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 18, gap: 16 },
  invoiceDetailsColumn: { flex: 1 },
  invoiceSectionTitle: { color: '#0f766e', fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  invoiceValueLarge: { color: '#1e293b', fontSize: 16, fontWeight: '800', marginTop: 8 },
  invoiceDetailText: { color: '#475569', fontSize: 12, marginTop: 5 },
  invoiceBreakdownHeading: { color: '#1e293b', fontSize: 16, fontWeight: '800', marginTop: 20 },
  invoiceValue: { color: '#1e293b', fontSize: 14, fontWeight: '800', marginTop: 3 },
  invoiceBreakdown: { borderColor: '#dbe7e4', borderWidth: 1, borderRadius: 12, overflow: 'hidden', marginTop: 10 },
  invoiceTableHeader: { backgroundColor: '#0f766e', padding: 10, flexDirection: 'row', gap: 8 },
  invoiceTableHeaderText: { color: '#fff', fontSize: 10, fontWeight: '800', flex: 1 },
  invoiceTableRow: { borderTopColor: '#e2e8f0', borderTopWidth: 1, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  invoiceTableCategory: { color: '#334155', fontSize: 11, fontWeight: '800', flex: 1 },
  invoiceTableDescription: { flex: 2 },
  invoiceCost: { color: '#334155', fontSize: 11, fontWeight: '800', flex: 1, textAlign: 'right' },
  invoiceDescription: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 7 },
  invoiceTotal: { borderTopColor: '#0f766e', borderTopWidth: 2, padding: 12, backgroundColor: '#f8fafc', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  invoiceTotalLabel: { color: '#334155', fontSize: 13, fontWeight: '800' },
  invoiceTotalValue: { color: '#0f766e', fontSize: 16, fontWeight: '900' },
  invoicePaymentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  invoicePayment: { backgroundColor: '#0f766e', color: '#fff', paddingHorizontal: 10, paddingVertical: 7, fontSize: 10, fontWeight: '800', overflow: 'hidden', borderRadius: 8 },
  invoiceFooter: { color: '#64748b', fontSize: 11, marginTop: 14 },
  invoiceButton: { backgroundColor: '#eef8f5', borderColor: '#b7e0d6', borderWidth: 1, borderRadius: 12, paddingVertical: 12, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  invoiceButtonText: { color: '#0f766e', fontSize: 13, fontWeight: '800' },
  successModalBackdrop: { flex: 1, backgroundColor: 'rgba(16,37,42,0.62)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successModalCard: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 24, padding: 25, alignItems: 'center', shadowColor: '#071619', shadowOpacity: 0.3, shadowRadius: 24, elevation: 10 },
  successIcon: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#0f766e', alignItems: 'center', justifyContent: 'center' },
  successModalEyebrow: { color: '#0f766e', fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginTop: 18 },
  successModalTitle: { color: '#10252a', fontSize: 23, fontWeight: '800', marginTop: 7, textAlign: 'center' },
  successModalMessage: { color: '#29434a', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  successModalHint: { color: '#718286', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 9 },
  successModalButton: { width: '100%', backgroundColor: '#0f766e', borderRadius: 14, paddingVertical: 14, minHeight: 50, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 22 },
  successModalButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  toast: { position: 'absolute', left: 20, right: 20, backgroundColor: '#10252a', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, elevation: 5 },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },
});
