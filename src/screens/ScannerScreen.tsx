import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
  SafeAreaView,
  Animated,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList, SessionScan } from '../types';
import { hydrateScan, isDuplicateInSession, getSessionScanCount } from '../services/hydrationService';

type Props = NativeStackScreenProps<RootStackParamList, 'Scanner'>;

const DEBOUNCE_MS = 1500;

export default function ScannerScreen({ route, navigation }: Props) {
  const { sessionId } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [recentScans, setRecentScans] = useState<SessionScan[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const [lastFeedback, setLastFeedback] = useState<'success' | 'duplicate' | 'pending' | null>(null);
  const lastScanTime = useRef<number>(0);
  const scannedIdsRef = useRef<Set<string>>(new Set());
  const feedbackAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission]);

  const flashFeedback = (type: 'success' | 'duplicate' | 'pending') => {
    setLastFeedback(type);
    feedbackAnim.setValue(1);
    Animated.timing(feedbackAnim, {
      toValue: 0,
      duration: 1200,
      useNativeDriver: true,
    }).start(() => setLastFeedback(null));
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    const now = Date.now();

    // Debounce: ignore scans within 1.5s of the last
    if (now - lastScanTime.current < DEBOUNCE_MS) return;
    lastScanTime.current = now;

    const idBarra = data.trim();
    if (!idBarra) return;

    // In-memory duplicate check (instant)
    if (scannedIdsRef.current.has(idBarra)) {
      // Haptic error feedback
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      flashFeedback('duplicate');
      Alert.alert('⚠️ Duplicado', `El código ${idBarra} ya fue escaneado en esta sesión.`);
      return;
    }

    // DB-level duplicate check (safety net)
    const dup = await isDuplicateInSession(idBarra, sessionId);
    if (dup) {
      scannedIdsRef.current.add(idBarra);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      flashFeedback('duplicate');
      Alert.alert('⚠️ Duplicado', `El código ${idBarra} ya fue escaneado en esta sesión.`);
      return;
    }

    // Valid scan → hydrate
    try {
      const scan = await hydrateScan(idBarra, sessionId);
      scannedIdsRef.current.add(idBarra);

      // Haptic success feedback
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      flashFeedback(scan.status === 'hydrated' ? 'success' : 'pending');

      // Add to recent scans (keep last 5)
      setRecentScans((prev) => [scan, ...prev].slice(0, 5));

      // Update total count
      const count = await getSessionScanCount(sessionId);
      setTotalScans(count);
    } catch (err) {
      console.error('Scan error:', err);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  };

  const handleGoToReview = () => {
    navigation.navigate('Review', { sessionId });
  };

  if (!permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionBox}>
          <Text style={styles.permissionTitle}>📷 Permiso de Cámara</Text>
          <Text style={styles.permissionText}>
            Se requiere acceso a la cámara para escanear códigos de barra.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Conceder Permiso</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const feedbackColor =
    lastFeedback === 'success'
      ? '#22C55E'
      : lastFeedback === 'duplicate'
      ? '#EF4444'
      : lastFeedback === 'pending'
      ? '#F59E0B'
      : 'transparent';

  return (
    <SafeAreaView style={styles.container}>
      {/* Camera View - top half */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'qr'] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        {/* Scan overlay */}
        <View style={styles.scanOverlay}>
          <View style={styles.scanFrame} />
        </View>
        {/* Flash feedback overlay */}
        <Animated.View
          style={[
            styles.feedbackOverlay,
            {
              backgroundColor: feedbackColor,
              opacity: feedbackAnim,
            },
          ]}
        />
      </View>

      {/* Scan counter */}
      <View style={styles.counterBar}>
        <Text style={styles.counterText}>
          🔢 Escaneados: <Text style={styles.counterValue}>{totalScans}</Text>
        </Text>
        <Text style={styles.sessionLabel}>Sesión: {sessionId.substring(0, 12)}...</Text>
      </View>

      {/* Recent scans list - bottom half */}
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>Últimos Escaneos</Text>
        {recentScans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📦</Text>
            <Text style={styles.emptyText}>Apunta la cámara a un código de barras</Text>
          </View>
        ) : (
          <FlatList
            data={recentScans}
            keyExtractor={(item) => item.id_barra + item.scan_timestamp}
            renderItem={({ item }) => (
              <View style={styles.scanItem}>
                <View
                  style={[
                    styles.statusIndicator,
                    {
                      backgroundColor:
                        item.status === 'hydrated' ? '#22C55E' : '#F59E0B',
                    },
                  ]}
                />
                <View style={styles.scanItemContent}>
                  <Text style={styles.scanBarcode}>{item.id_barra}</Text>
                  <Text style={styles.scanDetail}>
                    {item.status === 'hydrated'
                      ? `${item.cod_articulo} · ${item.descripcion} · ${item.peso_nominal}kg`
                      : 'Pendiente de datos maestros'}
                  </Text>
                </View>
              </View>
            )}
          />
        )}
      </View>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={styles.reviewButton}
          onPress={handleGoToReview}
          activeOpacity={0.8}
        >
          <Text style={styles.reviewButtonText}>📋 Ver Resumen ({totalScans})</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  cameraContainer: {
    height: '40%',
    position: 'relative',
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 150,
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  feedbackOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  counterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  counterText: {
    color: '#CBD5E1',
    fontSize: 15,
  },
  counterValue: {
    color: '#3B82F6',
    fontWeight: '700',
    fontSize: 18,
  },
  sessionLabel: {
    color: '#64748B',
    fontSize: 11,
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  listTitle: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 15,
    textAlign: 'center',
  },
  scanItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  scanItemContent: {
    flex: 1,
  },
  scanBarcode: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  scanDetail: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },
  actionBar: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  reviewButton: {
    backgroundColor: '#8B5CF6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  reviewButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
