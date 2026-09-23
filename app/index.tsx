import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Battery from 'expo-battery';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import {
  getInstalledApps,
  launchInstalledApp,
  startVoiceListening,
} from '@/lib/nativeLauncher';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const wallpaperSource = require('../assets/images/aurora-wallpaper.jpg');
const storageKeys = {
  wallpaper: 'launcher.wallpaper',
  pin: 'launcher.pin',
};

type AppItem = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  packageName: string;
  badge?: number;
};

const apps: AppItem[] = [
  { id: 'phone', label: 'Phone', icon: 'call', color: '#44C98B', packageName: 'com.google.android.dialer' },
  { id: 'messages', label: 'Messages', icon: 'chatbubble-ellipses', color: '#48D16D', packageName: 'com.google.android.apps.messaging', badge: 2 },
  { id: 'camera', label: 'Camera', icon: 'camera', color: '#2E3443', packageName: 'com.android.camera2' },
  { id: 'music', label: 'Music', icon: 'musical-notes', color: '#FF4F76', packageName: 'com.spotify.music' },
  { id: 'weather', label: 'Weather', icon: 'partly-sunny', color: '#55A8FF', packageName: 'com.google.android.apps.weather' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', color: '#F8F9FF', packageName: 'com.google.android.calendar' },
  { id: 'maps', label: 'Maps', icon: 'navigate', color: '#F7F8FA', packageName: 'com.google.android.apps.maps' },
  { id: 'photos', label: 'Photos', icon: 'images', color: '#F8F8FC', packageName: 'com.google.android.apps.photos' },
  { id: 'chrome', label: 'Chrome', icon: 'globe-outline', color: '#F9FAFF', packageName: 'com.android.chrome' },
  { id: 'mail', label: 'Mail', icon: 'mail', color: '#4C9EFF', packageName: 'com.google.android.gm', badge: 1 },
  { id: 'notes', label: 'Notes', icon: 'document-text', color: '#FFD644', packageName: 'com.google.android.keep' },
  { id: 'settings', label: 'Settings', icon: 'settings', color: '#AEB7C8', packageName: 'com.android.settings' },
];

const dockApps = apps.slice(0, 4);
const glass = 'rgba(18, 31, 58, 0.72)';

function triggerHaptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  Haptics.impactAsync(style).catch(() => undefined);
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDate(date: Date) {
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function IconButton({
  icon,
  onPress,
  label,
  size = 42,
  color = colors.light.foreground,
  background = 'rgba(255,255,255,0.16)',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label?: string;
  size?: number;
  color?: string;
  background?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      testID={label}
      onPress={() => {
        triggerHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={size * 0.48} color={color} />
    </Pressable>
  );
}

function AppIcon({ app, onPress }: { app: AppItem; onPress: () => void }) {
  const isLight = app.id === 'calendar' || app.id === 'maps' || app.id === 'photos' || app.id === 'chrome' || app.id === 'mail' || app.id === 'notes';
  return (
    <Pressable
      testID={`app-${app.id}`}
      accessibilityLabel={`Open ${app.label}`}
      onPress={() => {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [styles.appCell, pressed && styles.appPressed]}
    >
      <View style={[styles.appIcon, { backgroundColor: app.color }]}>
        <Ionicons name={app.icon} size={28} color={isLight ? '#43506B' : colors.light.foreground} />
        {app.badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{app.badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.appLabel} numberOfLines={1}>{app.label}</Text>
    </Pressable>
  );
}

function StatusBarOverlay({
  time,
  battery,
  onIslandPress,
}: {
  time: string;
  battery: number;
  onIslandPress: () => void;
}) {
  return (
    <View style={styles.statusBar} pointerEvents="box-none">
      <Text style={styles.statusTime}>{time}</Text>
      <Pressable onPress={onIslandPress} style={styles.dynamicIsland} testID="dynamic-island">
        <View style={styles.islandCamera} />
        <View style={styles.islandSpeaker} />
      </Pressable>
      <View style={styles.statusRight}>
        <Ionicons name="cellular" size={15} color={colors.light.foreground} />
        <Ionicons name="wifi" size={16} color={colors.light.foreground} />
        <View style={styles.batteryShape}>
          <View style={[styles.batteryFill, { width: `${Math.max(8, battery * 100)}%` }]} />
        </View>
      </View>
    </View>
  );
}

function WeatherWidget() {
  return (
    <View style={[styles.widget, styles.weatherWidget]}>
      <View style={styles.widgetHeader}>
        <View style={styles.widgetTitleLine}>
          <Ionicons name="partly-sunny" size={14} color="#A7D5FF" />
          <Text style={styles.widgetKicker}>WEATHER</Text>
        </View>
        <Ionicons name="ellipsis-horizontal" size={18} color="rgba(255,255,255,0.7)" />
      </View>
      <View style={styles.weatherRow}>
        <View>
          <Text style={styles.weatherTemp}>22°</Text>
          <Text style={styles.weatherSub}>New Delhi</Text>
        </View>
        <View style={styles.weatherIconWrap}>
          <Ionicons name="partly-sunny" size={32} color="#F5C95D" />
          <Text style={styles.weatherHigh}>H 27°</Text>
        </View>
      </View>
    </View>
  );
}

function CalendarWidget() {
  return (
    <View style={[styles.widget, styles.calendarWidget]}>
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetKicker}>WEDNESDAY</Text>
        <Text style={styles.calendarDay}>23</Text>
      </View>
      <Text style={styles.calendarTitle}>No more events today</Text>
      <Text style={styles.calendarSub}>Your day is clear</Text>
    </View>
  );
}

function ClockWidget() {
  return (
    <View style={[styles.widget, styles.clockWidget]}>
      <View style={styles.widgetHeader}>
        <Text style={styles.widgetKicker}>CLOCK</Text>
        <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.72)" />
      </View>
      <View style={styles.clockFace}>
        <View style={styles.clockHandHour} />
        <View style={styles.clockHandMinute} />
        <View style={styles.clockDot} />
      </View>
      <Text style={styles.clockCity}>New Delhi</Text>
    </View>
  );
}

function SiriOrb({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={() => { triggerHaptic(Haptics.ImpactFeedbackStyle.Medium); onPress(); }} style={styles.siriPressable} testID="siri-orb" accessibilityLabel="Open Siri">
      <LinearGradient colors={['#79E8FF', '#8A83FF', '#F05EA8']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.siriOrb}>
        <View style={styles.siriCore} />
      </LinearGradient>
      <Text style={styles.siriLabel}>Siri</Text>
    </Pressable>
  );
}

function QuickToggle({
  icon,
  title,
  subtitle,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.controlTile, pressed && styles.pressed]}>
      <View style={[styles.controlIcon, active && styles.controlIconActive]}>
        <Ionicons name={icon} size={20} color={active ? colors.light.primaryForeground : colors.light.foreground} />
      </View>
      <View style={styles.controlCopy}>
        <Text style={styles.controlTitle}>{title}</Text>
        <Text style={styles.controlSub}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function LockScreen({
  time,
  battery,
  onUnlock,
  onCamera,
  onFlashlight,
  onSiri,
  onNotificationCenter,
  wallpaper,
}: {
  time: string;
  battery: number;
  onUnlock: () => void;
  onCamera: () => void;
  onFlashlight: () => void;
  onSiri: () => void;
  onNotificationCenter: () => void;
  wallpaper: string | null;
}) {
  const insets = useSafeAreaInsets();
  const swipeY = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dy) > 10 || Math.abs(gesture.dx) > 10,
    onPanResponderMove: (_, gesture) => {
      if (gesture.dy < 0) swipeY.setValue(Math.max(-80, gesture.dy));
    },
    onPanResponderRelease: (_, gesture) => {
      const startedInTopLeft = gesture.y0 < insets.top + 100 && gesture.x0 < SCREEN_WIDTH * 0.52;
      if (gesture.dy > 55 && startedInTopLeft) {
        onNotificationCenter();
      } else if (gesture.dy < -55) {
        onUnlock();
      }
      Animated.spring(swipeY, { toValue: 0, useNativeDriver: true }).start();
    },
  }), [insets.top, onNotificationCenter, onUnlock, swipeY]);
  return (
    <Animated.View style={styles.absoluteFill} {...panResponder.panHandlers}>
      <ImageBackground source={wallpaper ? { uri: wallpaper } : wallpaperSource} style={styles.lockScreen} resizeMode="cover">
        <LinearGradient colors={['rgba(5,10,27,0.48)', 'rgba(5,10,27,0.08)', 'rgba(5,10,27,0.58)']} style={styles.absoluteFill} />
        <View style={[styles.lockTop, { paddingTop: insets.top + 18 }]}>
          <View style={styles.lockTopLeft}>
            <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.82)" />
            <Text style={styles.lockTopText}>New Delhi</Text>
          </View>
          <View style={styles.lockTopRight}>
            <Ionicons name="cellular" size={15} color={colors.light.foreground} />
            <Ionicons name="wifi" size={15} color={colors.light.foreground} />
            <Ionicons name="battery-half" size={18} color={colors.light.foreground} />
          </View>
        </View>
        <View style={styles.lockCenter}>
          <Ionicons name="lock-closed" size={17} color="rgba(255,255,255,0.92)" />
          <View style={styles.depthClock}>
            <Text style={[styles.lockTime, styles.lockTimeDepthBack]}>{time}</Text>
            <Text style={[styles.lockTime, styles.lockTimeDepthGlow]}>{time}</Text>
            <Text style={styles.lockTime}>{time}</Text>
          </View>
          <Text style={styles.lockDate}>{formatDate(new Date())}</Text>
          <View style={styles.lockWeatherPill}>
            <Ionicons name="partly-sunny" size={17} color="#F4CC62" />
            <Text style={styles.lockWeatherText}>22°  Clear skies</Text>
          </View>
        </View>
        <View style={[styles.lockBottom, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.lockActions}>
            <IconButton icon="flashlight" label="Flashlight" onPress={onFlashlight} background="rgba(0,0,0,0.22)" />
            <SiriOrb onPress={onSiri} />
            <IconButton icon="camera" label="Camera" onPress={onCamera} background="rgba(0,0,0,0.22)" />
          </View>
          <Pressable onPress={onUnlock} style={styles.swipeHint} testID="swipe-to-unlock">
            <Ionicons name="chevron-up" size={20} color="rgba(255,255,255,0.85)" />
            <Text style={styles.swipeText}>Swipe up to unlock</Text>
          </Pressable>
          <View style={styles.homeIndicator} />
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

function NotificationCenter({
  onClose,
  onUnlock,
}: {
  onClose: () => void;
  onUnlock: () => void;
}) {
  const insets = useSafeAreaInsets();
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy < -12,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -45) onClose();
    },
  }), [onClose]);
  return (
    <View style={styles.notificationOverlay} {...panResponder.panHandlers}>
      <BlurView intensity={94} tint="dark" style={styles.notificationCenter}>
        <View style={[styles.notificationHeader, { paddingTop: insets.top + 14 }]}>
          <View>
            <Text style={styles.notificationEyebrow}>NOTIFICATIONS</Text>
            <Text style={styles.notificationDate}>{formatDate(new Date())}</Text>
          </View>
          <IconButton icon="lock-open-outline" label="Unlock from Notification Center" onPress={onUnlock} background="rgba(255,255,255,0.1)" />
        </View>
        <View style={styles.notificationRule} />
        <Text style={styles.notificationSectionTitle}>Earlier today</Text>
        <View style={styles.notificationCard}>
          <View style={[styles.notificationAppIcon, { backgroundColor: '#49D675' }]}><Ionicons name="chatbubble-ellipses" size={18} color={colors.light.foreground} /></View>
          <View style={styles.notificationCopy}>
            <View style={styles.notificationTitleRow}><Text style={styles.notificationAppName}>Messages</Text><Text style={styles.notificationTime}>9:42 AM</Text></View>
            <Text style={styles.notificationTitle}>2 new messages</Text>
            <Text style={styles.notificationBody}>Rahul: “Are we still on for coffee?”</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.light.mutedForeground} />
        </View>
        <View style={styles.notificationCard}>
          <View style={[styles.notificationAppIcon, { backgroundColor: '#4E9FFF' }]}><Ionicons name="partly-sunny" size={18} color={colors.light.foreground} /></View>
          <View style={styles.notificationCopy}>
            <View style={styles.notificationTitleRow}><Text style={styles.notificationAppName}>Weather</Text><Text style={styles.notificationTime}>8:00 AM</Text></View>
            <Text style={styles.notificationTitle}>Clear skies today</Text>
            <Text style={styles.notificationBody}>22° in New Delhi. High of 27°.</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.light.mutedForeground} />
        </View>
        <View style={styles.notificationEmpty}>
          <Ionicons name="checkmark-done-outline" size={24} color={colors.light.primary} />
          <Text style={styles.notificationEmptyTitle}>All caught up</Text>
          <Text style={styles.notificationEmptySub}>Swipe up to return to Home</Text>
        </View>
        <View style={[styles.notificationBottom, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.homeIndicator} />
        </View>
      </BlurView>
    </View>
  );
}

function RecentAppsOverview({
  onClose,
  onOpenApp,
}: {
  onClose: () => void;
  onOpenApp: (app: AppItem) => void;
}) {
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy < -12,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -40) onClose();
    },
  }), [onClose]);
  return (
    <View style={styles.appSwitcherOverlay} {...panResponder.panHandlers}>
      <BlurView intensity={88} tint="dark" style={styles.appSwitcher}>
        <View style={styles.appSwitcherHeader}>
          <View><Text style={styles.panelEyebrow}>APP SWITCHER</Text><Text style={styles.panelTitle}>Recent Apps</Text></View>
          <IconButton icon="close" label="Close Recent Apps" onPress={onClose} background="rgba(255,255,255,0.12)" />
        </View>
        <Text style={styles.appSwitcherHint}>Swipe up to return home</Text>
        <View style={styles.recentCards}>
          {apps.slice(0, 4).map((app, index) => (
            <Pressable
              key={app.id}
              onPress={() => onOpenApp(app)}
              style={({ pressed }) => [styles.recentCard, { transform: [{ translateY: index * 7 }] }, pressed && styles.pressed]}
            >
              <View style={styles.recentCardTop}>
                <View style={[styles.recentAppIcon, { backgroundColor: app.color }]}><Ionicons name={app.icon} size={17} color={app.id === 'phone' || app.id === 'messages' || app.id === 'music' ? colors.light.foreground : '#43506B'} /></View>
                <Text style={styles.recentAppName}>{app.label}</Text>
                <Ionicons name="ellipsis-horizontal" size={17} color={colors.light.mutedForeground} />
              </View>
              <View style={[styles.recentPreview, { backgroundColor: index % 2 === 0 ? 'rgba(80,110,174,0.34)' : 'rgba(74,64,125,0.38)' }]}>
                {index === 0 ? <><Text style={styles.previewLarge}>Good morning</Text><Text style={styles.previewSmall}>Swipe gestures are ready</Text></> : index === 1 ? <><Text style={styles.previewLarge}>Messages</Text><Text style={styles.previewSmall}>2 unread conversations</Text></> : index === 2 ? <><Ionicons name="camera-outline" size={34} color="rgba(255,255,255,0.8)" /><Text style={styles.previewSmall}>Camera</Text></> : <><Ionicons name="musical-notes" size={28} color="#FF82A5" /><Text style={styles.previewSmall}>Nothing playing</Text></>}
              </View>
            </Pressable>
          ))}
        </View>
      </BlurView>
    </View>
  );
}

function PasscodeScreen({
  pinLength,
  enteredPin,
  onDigit,
  onDelete,
  onBiometric,
  onCancel,
}: {
  pinLength: number;
  enteredPin: string;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onBiometric: () => void;
  onCancel: () => void;
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <View style={styles.passcodeScreen}>
      <LinearGradient colors={['#101936', '#0A1026']} style={styles.absoluteFill} />
      <View style={styles.passcodeTop}>
        <IconButton icon="chevron-down" label="Close passcode" onPress={onCancel} background="rgba(255,255,255,0.08)" />
      </View>
      <View style={styles.passcodeHeader}>
        <View style={styles.passcodeLock}><Ionicons name="lock-closed" size={22} color={colors.light.foreground} /></View>
        <Text style={styles.passcodeTitle}>Enter Passcode</Text>
        <Text style={styles.passcodeSub}>Unlock iPhone Launcher</Text>
        <View style={styles.pinDots}>
          {Array.from({ length: pinLength }).map((_, index) => <View key={index} style={[styles.pinDot, index < enteredPin.length && styles.pinDotFilled]} />)}
        </View>
      </View>
      <View style={styles.keypad}>
        {keys.map((key) => (
          <Pressable key={key} onPress={() => onDigit(key)} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
            <Text style={styles.keyText}>{key}</Text>
          </Pressable>
        ))}
        <Pressable onPress={onBiometric} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
          <Ionicons name="finger-print" size={28} color={colors.light.primary} />
        </Pressable>
        <Pressable onPress={() => onDigit('0')} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
          <Text style={styles.keyText}>0</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
          <Ionicons name="backspace-outline" size={26} color={colors.light.foreground} />
        </Pressable>
      </View>
    </View>
  );
}

function ControlCenter({
  onClose,
  onLock,
  onSettings,
}: {
  onClose: () => void;
  onLock: () => void;
  onSettings: () => void;
}) {
  const [wifi, setWifi] = useState(true);
  const [bluetooth, setBluetooth] = useState(true);
  const [brightness, setBrightness] = useState(0.72);
  const [volume, setVolume] = useState(0.46);
  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <BlurView intensity={85} tint="dark" style={styles.controlCenter}>
        <View style={styles.controlHeader}>
          <View>
            <Text style={styles.panelEyebrow}>CONTROL CENTER</Text>
            <Text style={styles.panelTitle}>Quick controls</Text>
          </View>
          <IconButton icon="close" label="Close Control Center" onPress={onClose} background="rgba(255,255,255,0.12)" />
        </View>
        <View style={styles.controlGrid}>
          <QuickToggle icon="airplane" title="Airplane mode" subtitle="Off" onPress={() => undefined} />
          <QuickToggle icon="wifi" title="Wi-Fi" subtitle="Home network" active={wifi} onPress={() => setWifi((value) => !value)} />
          <QuickToggle icon="bluetooth" title="Bluetooth" subtitle={bluetooth ? 'On' : 'Off'} active={bluetooth} onPress={() => setBluetooth((value) => !value)} />
          <QuickToggle icon="cellular" title="Mobile data" subtitle="5G" active onPress={() => undefined} />
        </View>
        <View style={styles.sliderBlock}>
          <View style={styles.sliderLabel}><Ionicons name="sunny" size={18} color="#F5D36A" /><Text style={styles.sliderText}>Brightness</Text><Text style={styles.sliderValue}>{Math.round(brightness * 100)}%</Text></View>
          <Pressable style={styles.sliderTrack} onPress={(event) => setBrightness(Math.min(1, Math.max(0, event.nativeEvent.locationX / (SCREEN_WIDTH * 0.78))))}>
            <View style={[styles.sliderFill, { width: `${brightness * 100}%` }]} />
          </Pressable>
        </View>
        <View style={styles.sliderBlock}>
          <View style={styles.sliderLabel}><Ionicons name="volume-high" size={18} color="#B8C4FF" /><Text style={styles.sliderText}>Volume</Text><Text style={styles.sliderValue}>{Math.round(volume * 100)}%</Text></View>
          <Pressable style={styles.sliderTrack} onPress={(event) => setVolume(Math.min(1, Math.max(0, event.nativeEvent.locationX / (SCREEN_WIDTH * 0.78))))}>
            <View style={[styles.sliderFill, { width: `${volume * 100}%`, backgroundColor: colors.light.primary }]} />
          </Pressable>
        </View>
        <View style={styles.controlBottomRow}>
          <IconButton icon="flashlight" label="Flashlight" onPress={() => undefined} background="rgba(255,255,255,0.12)" />
          <IconButton icon="camera" label="Camera" onPress={() => undefined} background="rgba(255,255,255,0.12)" />
          <IconButton icon="lock-closed" label="Lock screen" onPress={onLock} background="rgba(255,255,255,0.12)" />
          <IconButton icon="settings-outline" label="Open settings" onPress={onSettings} background="rgba(255,255,255,0.12)" />
        </View>
      </BlurView>
    </View>
  );
}

function SiriSheet({
  onClose,
  onCommand,
}: {
  onClose: () => void;
  onCommand: (command: string) => void;
}) {
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const examples = ['Open WhatsApp', 'Change wallpaper', 'What is the weather?'];

  const listen = async () => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setListening(true);
    const result = await startVoiceListening();
    setListening(false);
    if (result) {
      setInput(result);
      onCommand(result);
    } else {
      inputRef.current?.focus();
    }
  };

  return (
    <View style={styles.overlay}>
      <BlurView intensity={90} tint="dark" style={styles.siriSheet}>
        <View style={styles.siriSheetHandle} />
        <View style={styles.siriSheetHeader}>
          <SiriOrb onPress={listen} />
          <View style={styles.siriSheetTitleWrap}>
            <Text style={styles.panelTitle}>How can I help?</Text>
            <Text style={styles.siriSheetSub}>{listening ? 'Listening…' : 'Ask Siri to open an app or change your launcher'}</Text>
          </View>
          <IconButton icon="close" label="Close Siri" onPress={onClose} background="rgba(255,255,255,0.12)" />
        </View>
        <View style={styles.commandInputWrap}>
          <TextInput
            ref={inputRef}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => onCommand(input)}
            placeholder="Type a command"
            placeholderTextColor="rgba(255,255,255,0.42)"
            style={styles.commandInput}
            returnKeyType="send"
          />
          <Pressable onPress={() => onCommand(input)} style={styles.commandSend}>
            <Ionicons name="arrow-up" size={20} color={colors.light.primaryForeground} />
          </Pressable>
        </View>
        <Text style={styles.suggestionLabel}>TRY SAYING</Text>
        <View style={styles.suggestionList}>
          {examples.map((example) => (
            <Pressable key={example} onPress={() => { setInput(example); onCommand(example); }} style={styles.suggestionChip}>
              <Ionicons name="sparkles-outline" size={15} color={colors.light.primary} />
              <Text style={styles.suggestionText}>{example}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.siriPrivacy}><Ionicons name="lock-closed" size={11} color={colors.light.mutedForeground} /> Private on this device</Text>
      </BlurView>
    </View>
  );
}

function SettingsSheet({
  onClose,
  wallpaper,
  onWallpaperChange,
  pinLength,
  onChangePin,
  onLock,
}: {
  onClose: () => void;
  wallpaper: string | null;
  onWallpaperChange: (uri: string | null) => void;
  pinLength: number;
  onChangePin: () => void;
  onLock: () => void;
}) {
  const pickWallpaper = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos permission needed', 'Allow photo access to choose a wallpaper from your gallery.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [9, 19] });
    if (!result.canceled && result.assets[0]?.uri) {
      onWallpaperChange(result.assets[0].uri);
    }
  };
  return (
    <View style={styles.overlay}>
      <BlurView intensity={92} tint="dark" style={styles.settingsSheet}>
        <View style={styles.siriSheetHandle} />
        <View style={styles.sheetHeader}>
          <View><Text style={styles.panelEyebrow}>LAUNCHER</Text><Text style={styles.panelTitle}>Settings</Text></View>
          <IconButton icon="close" label="Close settings" onPress={onClose} background="rgba(255,255,255,0.12)" />
        </View>
        <ScrollView contentContainerStyle={styles.settingsScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.settingsSectionLabel}>WALLPAPER</Text>
          <View style={styles.wallpaperCard}>
            <Image source={wallpaper ? { uri: wallpaper } : wallpaperSource} style={styles.wallpaperThumb} />
            <View style={styles.wallpaperCopy}><Text style={styles.settingsRowTitle}>iOS Aurora</Text><Text style={styles.settingsRowSub}>Applied to lock screen and home</Text></View>
            <Ionicons name="checkmark-circle" size={21} color={colors.light.primary} />
          </View>
          <Pressable onPress={pickWallpaper} style={({ pressed }) => [styles.settingsRow, pressed && styles.pressed]}>
            <View style={[styles.settingsRowIcon, { backgroundColor: '#5B6DF5' }]}><Ionicons name="images-outline" size={19} color={colors.light.foreground} /></View>
            <View style={styles.settingsRowCopy}><Text style={styles.settingsRowTitle}>Choose from Photos</Text><Text style={styles.settingsRowSub}>High-resolution gallery wallpaper</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.light.mutedForeground} />
          </Pressable>
          {wallpaper ? <Pressable onPress={() => onWallpaperChange(null)} style={styles.clearWallpaper}><Text style={styles.clearWallpaperText}>Restore iOS Aurora</Text></Pressable> : null}
          <Text style={styles.settingsSectionLabel}>SECURITY</Text>
          <Pressable onPress={onChangePin} style={styles.settingsRow}>
            <View style={[styles.settingsRowIcon, { backgroundColor: '#7C64E8' }]}><Ionicons name="keypad-outline" size={19} color={colors.light.foreground} /></View>
            <View style={styles.settingsRowCopy}><Text style={styles.settingsRowTitle}>Passcode</Text><Text style={styles.settingsRowSub}>{pinLength}-digit PIN enabled</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.light.mutedForeground} />
          </Pressable>
          <Pressable onPress={onLock} style={styles.settingsRow}>
            <View style={[styles.settingsRowIcon, { backgroundColor: '#E15E80' }]}><Ionicons name="lock-closed-outline" size={19} color={colors.light.foreground} /></View>
            <View style={styles.settingsRowCopy}><Text style={styles.settingsRowTitle}>Lock now</Text><Text style={styles.settingsRowSub}>Require authentication to continue</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.light.mutedForeground} />
          </Pressable>
          <Text style={styles.settingsSectionLabel}>ANDROID BRIDGE</Text>
          <View style={styles.bridgeCard}>
            <View style={styles.bridgeStatus}><View style={styles.greenDot} /><Text style={styles.bridgeTitle}>Launcher mode ready</Text></View>
            <Text style={styles.bridgeSub}>Set this app as your default Home app in Android Settings to replace the system launcher.</Text>
            <Pressable onPress={() => Linking.openSettings()} style={styles.androidSettingsButton}><Ionicons name="open-outline" size={15} color={colors.light.primaryForeground} /><Text style={styles.androidSettingsText}>Open Android Settings</Text></Pressable>
          </View>
        </ScrollView>
      </BlurView>
    </View>
  );
}

function PinSetupSheet({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (pin: string) => void;
}) {
  const [newPin, setNewPin] = useState('');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  return (
    <View style={styles.overlay}>
      <BlurView intensity={92} tint="dark" style={styles.pinSetupSheet}>
        <View style={styles.siriSheetHandle} />
        <View style={styles.sheetHeader}>
          <View>
            <Text style={styles.panelEyebrow}>SECURITY</Text>
            <Text style={styles.panelTitle}>Change passcode</Text>
          </View>
          <IconButton icon="close" label="Close passcode setup" onPress={onClose} background="rgba(255,255,255,0.12)" />
        </View>
        <Text style={styles.pinSetupSub}>Choose a 4-digit PIN for the launcher lock screen.</Text>
        <View style={styles.pinDots}>
          {Array.from({ length: 4 }).map((_, index) => (
            <View key={index} style={[styles.pinDot, index < newPin.length && styles.pinDotFilled]} />
          ))}
        </View>
        <View style={styles.pinSetupKeys}>
          {keys.map((key) => (
            <Pressable key={key} onPress={() => setNewPin((value) => value.length < 4 ? value + key : value)} style={styles.pinSetupKey}>
              <Text style={styles.pinSetupKeyText}>{key}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setNewPin((value) => value.slice(0, -1))} style={styles.pinSetupKey}>
            <Ionicons name="backspace-outline" size={22} color={colors.light.foreground} />
          </Pressable>
        </View>
        <Pressable disabled={newPin.length !== 4} onPress={() => onSave(newPin)} style={[styles.savePinButton, newPin.length !== 4 && styles.savePinDisabled]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.light.primaryForeground} />
          <Text style={styles.savePinText}>Save new PIN</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

export default function LauncherScreen() {
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(new Date());
  const [battery, setBattery] = useState(0.86);
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const [pin, setPin] = useState('1234');
  const [isLocked, setIsLocked] = useState(true);
  const [passcodeVisible, setPasscodeVisible] = useState(false);
  const [pinSetupVisible, setPinSetupVisible] = useState(false);
  const [enteredPin, setEnteredPin] = useState('');
  const [controlCenterVisible, setControlCenterVisible] = useState(false);
  const [notificationCenterVisible, setNotificationCenterVisible] = useState(false);
  const [appSwitcherVisible, setAppSwitcherVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [siriVisible, setSiriVisible] = useState(false);
  const [islandExpanded, setIslandExpanded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const inFlightLaunch = useRef(false);
  const homeGestureStartedAt = useRef(0);
  const homeGestureOpenedSwitcher = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      const [savedWallpaper, savedPin, savedBattery] = await Promise.all([
        AsyncStorage.getItem(storageKeys.wallpaper),
        AsyncStorage.getItem(storageKeys.pin),
        Platform.OS === 'web' ? Promise.resolve(0.86) : Battery.getBatteryLevelAsync().catch(() => 0.86),
      ]);
      if (!active) return;
      setWallpaper(savedWallpaper);
      if (savedPin) setPin(savedPin);
      if (typeof savedBattery === 'number' && savedBattery > 0) setBattery(savedBattery);
    }
    loadPreferences();
    return () => { active = false; };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [toastOpacity]);

  const openApp = useCallback(async (app: AppItem) => {
    if (inFlightLaunch.current) return;
    inFlightLaunch.current = true;
    const opened = await launchInstalledApp(app.packageName);
    inFlightLaunch.current = false;
    if (!opened) {
      showToast(`${app.label} is ready when the Android launcher bridge is enabled`);
    }
  }, [showToast]);

  const lock = useCallback(() => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setControlCenterVisible(false);
    setSettingsVisible(false);
    setIsLocked(true);
  }, []);

  const unlock = useCallback(() => {
    setPasscodeVisible(true);
    setEnteredPin('');
  }, []);

  const handleBiometric = useCallback(async () => {
    if (Platform.OS === 'web') {
      showToast('Biometrics are available in the Android build');
      return;
    }
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !enrolled) {
      showToast('Set up fingerprint or face unlock in Android Settings');
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock iOS Android Launcher', cancelLabel: 'Use PIN' });
    if (result.success) {
      setIsLocked(false);
      setPasscodeVisible(false);
      setEnteredPin('');
    }
  }, [showToast]);

  const handleDigit = useCallback((digit: string) => {
    if (enteredPin.length >= pin.length) return;
    const next = enteredPin + digit;
    setEnteredPin(next);
    if (next.length === pin.length) {
      if (next === pin) {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
        setIsLocked(false);
        setPasscodeVisible(false);
        setEnteredPin('');
      } else {
        triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
        showToast('Incorrect passcode');
        setEnteredPin('');
      }
    }
  }, [enteredPin, pin, showToast]);

  const handleCommand = useCallback((command: string) => {
    const normalized = command.trim().toLowerCase();
    if (!normalized) return;
    if (normalized.includes('wallpaper')) {
      setSiriVisible(false);
      setSettingsVisible(true);
      showToast('Wallpaper settings opened');
      return;
    }
    if (normalized.includes('weather')) {
      setSiriVisible(false);
      showToast('It is 22° and clear in New Delhi');
      return;
    }
    const app = apps.find((item) => normalized.includes(item.label.toLowerCase()));
    if (app) {
      setSiriVisible(false);
      void openApp(app);
      return;
    }
    showToast('Try “Open Camera” or “Change wallpaper”');
  }, [openApp, showToast]);

  const selectWallpaper = useCallback((uri: string | null) => {
    setWallpaper(uri);
    if (uri) AsyncStorage.setItem(storageKeys.wallpaper, uri).catch(() => undefined);
    else AsyncStorage.removeItem(storageKeys.wallpaper).catch(() => undefined);
  }, []);

  const homePanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 14 && gesture.y0 < insets.top + 90,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy > 50) {
        if (gesture.x0 < SCREEN_WIDTH * 0.5) {
          setNotificationCenterVisible(true);
        } else {
          setControlCenterVisible(true);
        }
        triggerHaptic();
      }
    },
  }), [insets.top]);

  const homeIndicatorPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      homeGestureStartedAt.current = Date.now();
      homeGestureOpenedSwitcher.current = false;
    },
    onPanResponderMove: (_, gesture) => {
      if (
        gesture.dy < -34 &&
        Date.now() - homeGestureStartedAt.current > 280 &&
        !homeGestureOpenedSwitcher.current
      ) {
        homeGestureOpenedSwitcher.current = true;
        setNotificationCenterVisible(false);
        setControlCenterVisible(false);
        setAppSwitcherVisible(true);
        triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
      }
    },
    onPanResponderRelease: (_, gesture) => {
      if (!homeGestureOpenedSwitcher.current && gesture.dy < -45) {
        if (notificationCenterVisible || controlCenterVisible) {
          setNotificationCenterVisible(false);
          setControlCenterVisible(false);
        } else {
          showToast('Home');
        }
      }
      homeGestureOpenedSwitcher.current = false;
    },
  }), [controlCenterVisible, notificationCenterVisible, showToast]);

  const compactTime = formatTime(now);
  return (
    <View style={styles.root} {...homePanResponder.panHandlers}>
      <StatusBar style="light" hidden />
      <ImageBackground source={wallpaper ? { uri: wallpaper } : wallpaperSource} style={styles.homeScreen} resizeMode="cover">
        <LinearGradient colors={['rgba(5,10,26,0.24)', 'rgba(6,12,31,0.04)', 'rgba(5,9,23,0.5)']} style={styles.absoluteFill} />
        <StatusBarOverlay time={compactTime} battery={battery} onIslandPress={() => setIslandExpanded((value) => !value)} />
        {islandExpanded ? (
          <Pressable onPress={() => setIslandExpanded(false)} style={styles.islandExpanded}>
            <Ionicons name="musical-notes" size={18} color="#92E9FF" />
            <View style={styles.islandExpandedCopy}><Text style={styles.islandExpandedTitle}>Nothing playing</Text><Text style={styles.islandExpandedSub}>Tap to open media controls</Text></View>
            <Ionicons name="chevron-forward" size={16} color={colors.light.mutedForeground} />
          </Pressable>
        ) : null}
        <ScrollView contentContainerStyle={[styles.homeContent, { paddingTop: insets.top + 46, paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false} scrollEnabled={!controlCenterVisible}>
          <View style={styles.welcomeRow}>
            <View><Text style={styles.greeting}>Good morning</Text><Text style={styles.homeDate}>{formatDate(now)}</Text></View>
            <IconButton icon="settings-outline" label="Open settings" onPress={() => setSettingsVisible(true)} background="rgba(6,14,33,0.36)" />
          </View>
          <View style={styles.widgetsRow}><WeatherWidget /><CalendarWidget /></View>
          <ClockWidget />
          <View style={styles.appsGrid}>
            {apps.map((app) => <AppIcon key={app.id} app={app} onPress={() => void openApp(app)} />)}
          </View>
        </ScrollView>
        <View style={[styles.dockWrap, { bottom: insets.bottom + 18 }]}>
          <BlurView intensity={72} tint="dark" style={styles.dock}>
            {dockApps.map((app) => <AppIcon key={app.id} app={app} onPress={() => void openApp(app)} />)}
          </BlurView>
        </View>
        <View style={[styles.homeFooter, { bottom: insets.bottom + 2 }]} pointerEvents="box-none">
          <SiriOrb onPress={() => setSiriVisible(true)} />
          <View style={styles.homeIndicatorRegion} {...homeIndicatorPanResponder.panHandlers}>
            <View style={styles.homeIndicator} />
          </View>
          <Pressable onPress={() => setControlCenterVisible(true)} style={styles.controlCenterHint} testID="open-control-center">
            <Ionicons name="chevron-up" size={16} color="rgba(255,255,255,0.72)" />
          </Pressable>
        </View>
      </ImageBackground>
      {isLocked && !passcodeVisible ? <LockScreen time={compactTime} battery={battery} wallpaper={wallpaper} onUnlock={unlock} onCamera={() => showToast('Camera shortcut ready')} onFlashlight={() => showToast('Flashlight shortcut ready')} onSiri={() => setSiriVisible(true)} onNotificationCenter={() => setNotificationCenterVisible(true)} /> : null}
      {notificationCenterVisible && !passcodeVisible ? <NotificationCenter onClose={() => setNotificationCenterVisible(false)} onUnlock={unlock} /> : null}
      {appSwitcherVisible && !passcodeVisible ? <RecentAppsOverview onClose={() => setAppSwitcherVisible(false)} onOpenApp={(app) => { setAppSwitcherVisible(false); void openApp(app); }} /> : null}
      {passcodeVisible ? <PasscodeScreen pinLength={pin.length} enteredPin={enteredPin} onDigit={handleDigit} onDelete={() => setEnteredPin((value) => value.slice(0, -1))} onBiometric={handleBiometric} onCancel={() => setPasscodeVisible(false)} /> : null}
      {controlCenterVisible && !passcodeVisible && !notificationCenterVisible ? <ControlCenter onClose={() => setControlCenterVisible(false)} onLock={lock} onSettings={() => { setControlCenterVisible(false); setSettingsVisible(true); }} /> : null}
      {siriVisible ? <Modal transparent animationType="slide" visible onRequestClose={() => setSiriVisible(false)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}><SiriSheet onClose={() => setSiriVisible(false)} onCommand={handleCommand} /></KeyboardAvoidingView></Modal> : null}
      {settingsVisible ? <Modal transparent animationType="slide" visible onRequestClose={() => setSettingsVisible(false)}><SettingsSheet onClose={() => setSettingsVisible(false)} wallpaper={wallpaper} onWallpaperChange={selectWallpaper} pinLength={pin.length} onChangePin={() => { setSettingsVisible(false); setPinSetupVisible(true); }} onLock={lock} /></Modal> : null}
      {pinSetupVisible ? <Modal transparent animationType="slide" visible onRequestClose={() => setPinSetupVisible(false)}><PinSetupSheet onClose={() => setPinSetupVisible(false)} onSave={(nextPin) => { setPin(nextPin); AsyncStorage.setItem(storageKeys.pin, nextPin).catch(() => undefined); setPinSetupVisible(false); showToast('Passcode updated'); }} /></Modal> : null}
      {toast ? <Animated.View style={[styles.toast, { top: insets.top + 58, opacity: toastOpacity }]}><Ionicons name="sparkles-outline" size={15} color={colors.light.primary} /><Text style={styles.toastText}>{toast}</Text></Animated.View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  absoluteFill: { ...StyleSheet.absoluteFill },
  homeScreen: { flex: 1, backgroundColor: colors.light.background },
  lockScreen: { flex: 1, backgroundColor: colors.light.background },
  statusBar: { position: 'absolute', zIndex: 20, top: 10, left: 18, right: 18, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusTime: { color: colors.light.foreground, fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  dynamicIsland: { position: 'absolute', left: '50%', marginLeft: -44, top: 0, width: 88, height: 26, borderRadius: 18, backgroundColor: '#050710', alignItems: 'center', justifyContent: 'center' },
  islandCamera: { position: 'absolute', right: 15, width: 7, height: 7, borderRadius: 5, backgroundColor: '#1E3159', borderWidth: 1, borderColor: '#2F4B7E' },
  islandSpeaker: { position: 'absolute', left: 17, width: 20, height: 3, borderRadius: 3, backgroundColor: '#10162A' },
  statusRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  batteryShape: { width: 21, height: 10, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.78)', padding: 1 },
  batteryFill: { height: 6, borderRadius: 2, backgroundColor: '#F5FAFF' },
  homeContent: { paddingHorizontal: 18, gap: 14 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  greeting: { color: colors.light.foreground, fontSize: 27, fontWeight: '700', letterSpacing: -0.8 },
  homeDate: { color: 'rgba(255,255,255,0.66)', fontSize: 12, marginTop: 4, letterSpacing: 0.1 },
  widgetsRow: { flexDirection: 'row', gap: 12 },
  widget: { borderRadius: 24, overflow: 'hidden', padding: 15, backgroundColor: 'rgba(18,31,58,0.73)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  weatherWidget: { flex: 1.18, minHeight: 132 },
  calendarWidget: { flex: 0.82, minHeight: 132, backgroundColor: 'rgba(30,39,72,0.76)' },
  widgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  widgetTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  widgetKicker: { color: 'rgba(255,255,255,0.58)', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  weatherRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flex: 1 },
  weatherTemp: { color: colors.light.foreground, fontSize: 36, fontWeight: '400', letterSpacing: -1.8 },
  weatherSub: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: -2 },
  weatherIconWrap: { alignItems: 'flex-end', gap: 5 },
  weatherHigh: { color: 'rgba(255,255,255,0.6)', fontSize: 10 },
  calendarDay: { color: '#F26B83', fontSize: 20, fontWeight: '700' },
  calendarTitle: { color: colors.light.foreground, fontSize: 14, fontWeight: '600', marginTop: 27 },
  calendarSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 5 },
  clockWidget: { minHeight: 144, flexDirection: 'column' },
  clockFace: { alignSelf: 'center', width: 72, height: 72, borderRadius: 40, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  clockHandHour: { position: 'absolute', width: 3, height: 22, borderRadius: 2, backgroundColor: colors.light.foreground, bottom: 34, transform: [{ rotate: '25deg' }] },
  clockHandMinute: { position: 'absolute', width: 2, height: 28, borderRadius: 2, backgroundColor: '#9EC2FF', bottom: 34, transform: [{ rotate: '140deg' }] },
  clockDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: '#F5C95D' },
  clockCity: { textAlign: 'center', color: 'rgba(255,255,255,0.62)', fontSize: 11, marginTop: 5 },
  appsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 15, paddingTop: 4 },
  appCell: { width: (SCREEN_WIDTH - 36 - 30) / 4, alignItems: 'center', gap: 6 },
  appPressed: { transform: [{ scale: 0.92 }], opacity: 0.82 },
  appIcon: { width: 58, height: 58, borderRadius: 17, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.24, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  appLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '500', maxWidth: 70, textAlign: 'center' },
  badge: { position: 'absolute', right: -4, top: -4, minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, backgroundColor: '#FF446A', borderWidth: 1.5, borderColor: '#1A2540', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.light.foreground, fontSize: 10, fontWeight: '700' },
  dockWrap: { position: 'absolute', left: 18, right: 18, height: 91, borderRadius: 28, overflow: 'hidden' },
  dock: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', backgroundColor: 'rgba(19,30,59,0.52)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 4 },
  homeFooter: { position: 'absolute', left: 22, right: 22, height: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  siriPressable: { alignItems: 'center', gap: 3 },
  siriOrb: { width: 37, height: 37, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#91D9FF', shadowOpacity: 0.48, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  siriCore: { width: 12, height: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.86)', transform: [{ rotate: '-9deg' }] },
  siriLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: '600' },
  controlCenterHint: { width: 38, height: 38, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,8,22,0.32)' },
  islandExpanded: { position: 'absolute', zIndex: 25, top: 47, left: 22, right: 22, borderRadius: 22, backgroundColor: 'rgba(11,21,45,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  islandExpandedCopy: { flex: 1 },
  islandExpandedTitle: { color: colors.light.foreground, fontWeight: '600', fontSize: 13 },
  islandExpandedSub: { color: colors.light.mutedForeground, fontSize: 11, marginTop: 3 },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  overlay: { ...StyleSheet.absoluteFill, zIndex: 50, justifyContent: 'flex-start' },
  controlCenter: { marginTop: 14, marginHorizontal: 12, borderRadius: 32, overflow: 'hidden', padding: 18, backgroundColor: glass, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  controlHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  panelEyebrow: { color: colors.light.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  panelTitle: { color: colors.light.foreground, fontSize: 23, fontWeight: '700', letterSpacing: -0.4, marginTop: 4 },
  controlGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  controlTile: { width: '48%', minHeight: 62, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.07)', padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  controlIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  controlIconActive: { backgroundColor: colors.light.primary },
  controlCopy: { flex: 1 },
  controlTitle: { color: colors.light.foreground, fontSize: 11, fontWeight: '600' },
  controlSub: { color: colors.light.mutedForeground, fontSize: 10, marginTop: 3 },
  sliderBlock: { marginTop: 16 },
  sliderLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sliderText: { color: colors.light.foreground, fontSize: 12, fontWeight: '600', flex: 1 },
  sliderValue: { color: colors.light.mutedForeground, fontSize: 11 },
  sliderTrack: { height: 8, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  sliderFill: { height: '100%', borderRadius: 6, backgroundColor: '#F5D36A' },
  controlBottomRow: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', marginTop: 18, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-around' },
  lockTop: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lockTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockTopText: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '600' },
  lockTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lockCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 90 },
  depthClock: { position: 'relative', marginTop: 12, alignItems: 'center', justifyContent: 'center' },
  lockTime: { color: colors.light.foreground, fontSize: 64, fontWeight: '300', letterSpacing: -3, marginTop: 12 },
  lockTimeDepthBack: { position: 'absolute', color: 'rgba(0,8,27,0.7)', transform: [{ translateY: 7 }], opacity: 0.95 },
  lockTimeDepthGlow: { position: 'absolute', color: 'rgba(205,225,255,0.26)', transform: [{ translateY: -2 }], opacity: 0.9 },
  lockDate: { color: colors.light.foreground, fontSize: 16, fontWeight: '500', marginTop: 3 },
  lockWeatherPill: { marginTop: 18, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.2)', flexDirection: 'row', alignItems: 'center', gap: 7 },
  lockWeatherText: { color: 'rgba(255,255,255,0.86)', fontSize: 12 },
  lockBottom: { alignItems: 'center' },
  lockActions: { width: '100%', paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  swipeHint: { alignItems: 'center', marginTop: 12, gap: 2 },
  swipeText: { color: 'rgba(255,255,255,0.76)', fontSize: 11, fontWeight: '500' },
  homeIndicator: { height: 4, width: 116, borderRadius: 4, backgroundColor: colors.light.foreground, opacity: 0.82, marginTop: 9 },
  homeIndicatorRegion: { position: 'absolute', left: '50%', bottom: 0, marginLeft: -68, width: 136, height: 42, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3 },
  notificationOverlay: { ...StyleSheet.absoluteFill, zIndex: 75, backgroundColor: 'rgba(5,10,26,0.26)' },
  notificationCenter: { flex: 1, paddingHorizontal: 18, backgroundColor: 'rgba(8,17,39,0.87)' },
  notificationHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 16 },
  notificationEyebrow: { color: colors.light.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  notificationDate: { color: colors.light.foreground, fontSize: 26, fontWeight: '700', letterSpacing: -0.6, marginTop: 5 },
  notificationRule: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  notificationSectionTitle: { color: colors.light.mutedForeground, fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 9 },
  notificationCard: { minHeight: 92, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 9 },
  notificationAppIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notificationCopy: { flex: 1 },
  notificationTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notificationAppName: { color: colors.light.foreground, fontSize: 11, fontWeight: '700' },
  notificationTime: { color: colors.light.mutedForeground, fontSize: 10 },
  notificationTitle: { color: colors.light.foreground, fontSize: 13, fontWeight: '600', marginTop: 6 },
  notificationBody: { color: colors.light.mutedForeground, fontSize: 11, marginTop: 3 },
  notificationEmpty: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingBottom: 70 },
  notificationEmptyTitle: { color: colors.light.foreground, fontSize: 14, fontWeight: '700', marginTop: 10 },
  notificationEmptySub: { color: colors.light.mutedForeground, fontSize: 11, marginTop: 5 },
  notificationBottom: { alignItems: 'center' },
  appSwitcherOverlay: { ...StyleSheet.absoluteFill, zIndex: 80, backgroundColor: 'rgba(4,9,24,0.35)' },
  appSwitcher: { flex: 1, paddingTop: 52, paddingHorizontal: 18, backgroundColor: 'rgba(8,16,38,0.88)' },
  appSwitcherHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  appSwitcherHint: { color: colors.light.mutedForeground, fontSize: 12, marginTop: 4 },
  recentCards: { flex: 1, alignItems: 'center', marginTop: 20, paddingBottom: 38 },
  recentCard: { width: '92%', minHeight: 150, borderRadius: 24, backgroundColor: 'rgba(18,29,57,0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', padding: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 7 }, elevation: 5, marginBottom: -78 },
  recentCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recentAppIcon: { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  recentAppName: { flex: 1, color: colors.light.foreground, fontSize: 12, fontWeight: '700' },
  recentPreview: { flex: 1, minHeight: 98, borderRadius: 16, marginTop: 10, padding: 13, justifyContent: 'flex-end' },
  previewLarge: { color: colors.light.foreground, fontSize: 17, fontWeight: '700' },
  previewSmall: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 4 },
  passcodeScreen: { ...StyleSheet.absoluteFill, zIndex: 100, backgroundColor: '#0A1026' },
  passcodeTop: { paddingTop: 18, paddingHorizontal: 18 },
  passcodeHeader: { alignItems: 'center', marginTop: 47 },
  passcodeLock: { width: 48, height: 48, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  passcodeTitle: { color: colors.light.foreground, fontSize: 24, fontWeight: '700', marginTop: 14 },
  passcodeSub: { color: colors.light.mutedForeground, fontSize: 13, marginTop: 5 },
  pinDots: { flexDirection: 'row', gap: 12, marginTop: 21 },
  pinDot: { width: 10, height: 10, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.46)' },
  pinDotFilled: { backgroundColor: colors.light.primary, borderColor: colors.light.primary },
  keypad: { marginTop: 56, paddingHorizontal: 42, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18 },
  key: { width: 72, height: 72, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  keyPressed: { backgroundColor: 'rgba(167,184,255,0.35)', transform: [{ scale: 0.95 }] },
  keyText: { color: colors.light.foreground, fontSize: 28, fontWeight: '300' },
  siriSheet: { flex: 1, marginTop: 160, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, backgroundColor: 'rgba(10,18,43,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  siriSheetHandle: { width: 42, height: 4, borderRadius: 3, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.26)', marginBottom: 20 },
  siriSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  siriSheetTitleWrap: { flex: 1 },
  siriSheetSub: { color: colors.light.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 4 },
  commandInputWrap: { marginTop: 24, minHeight: 54, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', paddingLeft: 15, paddingRight: 6 },
  commandInput: { flex: 1, color: colors.light.foreground, fontSize: 14, paddingVertical: 15 },
  commandSend: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.light.primary, alignItems: 'center', justifyContent: 'center' },
  suggestionLabel: { color: colors.light.mutedForeground, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginTop: 24, marginBottom: 10 },
  suggestionList: { gap: 8 },
  suggestionChip: { borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.07)', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  suggestionText: { color: 'rgba(255,255,255,0.82)', fontSize: 13 },
  siriPrivacy: { textAlign: 'center', color: colors.light.mutedForeground, fontSize: 11, marginTop: 24 },
  settingsSheet: { flex: 1, marginTop: 115, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, backgroundColor: 'rgba(10,18,43,0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  pinSetupSheet: { flex: 1, marginTop: 115, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 20, backgroundColor: 'rgba(10,18,43,0.95)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  settingsScroll: { paddingBottom: 36 },
  settingsSectionLabel: { color: colors.light.mutedForeground, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginTop: 18, marginBottom: 9 },
  wallpaperCard: { borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', padding: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  wallpaperThumb: { width: 46, height: 60, borderRadius: 12 },
  wallpaperCopy: { flex: 1 },
  settingsRow: { minHeight: 69, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.07)', padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 8 },
  settingsRowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  settingsRowCopy: { flex: 1 },
  settingsRowTitle: { color: colors.light.foreground, fontSize: 13, fontWeight: '600' },
  settingsRowSub: { color: colors.light.mutedForeground, fontSize: 11, marginTop: 4 },
  clearWallpaper: { alignItems: 'center', paddingVertical: 5 },
  clearWallpaperText: { color: colors.light.primary, fontSize: 12, fontWeight: '600' },
  bridgeCard: { borderRadius: 20, backgroundColor: 'rgba(81,206,143,0.09)', borderWidth: 1, borderColor: 'rgba(81,206,143,0.22)', padding: 15 },
  bridgeStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greenDot: { width: 8, height: 8, borderRadius: 5, backgroundColor: '#61D993' },
  bridgeTitle: { color: '#A8F1C3', fontSize: 13, fontWeight: '700' },
  bridgeSub: { color: 'rgba(196,240,213,0.68)', fontSize: 11, lineHeight: 16, marginTop: 8 },
  pinSetupSub: { color: colors.light.mutedForeground, fontSize: 13, lineHeight: 19, marginTop: 2 },
  pinSetupKeys: { marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  pinSetupKey: { width: '30%', height: 52, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  pinSetupKeyText: { color: colors.light.foreground, fontSize: 22, fontWeight: '400' },
  savePinButton: { marginTop: 20, height: 48, borderRadius: 16, backgroundColor: colors.light.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  savePinDisabled: { opacity: 0.4 },
  savePinText: { color: colors.light.primaryForeground, fontSize: 13, fontWeight: '700' },
  androidSettingsButton: { alignSelf: 'flex-start', marginTop: 13, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: 'rgba(167,184,255,0.9)', flexDirection: 'row', alignItems: 'center', gap: 6 },
  androidSettingsText: { color: colors.light.primaryForeground, fontSize: 11, fontWeight: '700' },
  modalRoot: { flex: 1 },
  toast: { position: 'absolute', zIndex: 200, alignSelf: 'center', maxWidth: '88%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(14,25,52,0.94)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', gap: 8 },
  toastText: { color: colors.light.foreground, fontSize: 12, fontWeight: '600' },
});